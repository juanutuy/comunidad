// Búsqueda global del tenant: publicaciones, canales, cursos y miembros.
// Respeta el acceso a canales: las publicaciones de canales pagos o
// privados sin acceso aparecen SOLO como teaser (igual que en el feed),
// nunca con el cuerpo completo.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import type { ChannelRow } from '../utils/community'
import { getPrivacySettings } from '../utils/privacy'
import { courseListed } from '../utils/courses'
import type { CourseRow } from '../utils/courses'
import { dbFor } from '../utils/db'
import { hiddenFilterSql } from '../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 2) return { posts: [], channels: [], courses: [], members: [] }
  const like = `%${q}%`
  const db = await dbFor(event)
  const { user, role } = await currentAuth(event, tenant.id)
  const priv = await getPrivacySettings(event, tenant.id)
  // Fase 15: la búsqueda NO se abre a visitantes en el modo público
  // (buscar miembros y contenido sigue siendo cosa de la sesión). En
  // el modo privado queda como siempre.
  if (!user && priv.visibility === 'public')
    throw createError({ statusCode: 401, message: 'Iniciá sesión para buscar en la comunidad.' })

  const hf = hiddenFilterSql(user?.id ?? null)
  const postRows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'published' AND (p.title LIKE ? OR p.body LIKE ?)${hf.sql} ORDER BY p.created_at DESC LIMIT 10`).all(tenant.id, like, like, ...hf.params) as Record<string, unknown>[]
  // Fase 12: la búsqueda excluye los posts en revisión para todos,
  // excepto su autor y los admins (misma regla que feed y perfil).
  if (user) {
    const reviewRows = role === 'admin'
      ? await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'review' AND (p.title LIKE ? OR p.body LIKE ?)${hf.sql} ORDER BY p.created_at DESC LIMIT 10`).all(tenant.id, like, like, ...hf.params) as Record<string, unknown>[]
      : await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'review' AND p.author_id = ? AND (p.title LIKE ? OR p.body LIKE ?)${hf.sql} ORDER BY p.created_at DESC LIMIT 10`).all(tenant.id, user.id, like, like, ...hf.params) as Record<string, unknown>[]
    postRows.push(...reviewRows)
  }
  const posts = []
  for (const r of postRows) {
    const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    const access = await canAccessChannel(event, user?.id ?? null, role, ch)
    if (ch.type === 'private' && !access) continue // privado sin acceso: ni el teaser sale del canal
    // Fase 15: «dónde aparecen» también limpia la búsqueda — con
    // 'channel' o 'hidden', la tarjeta bloqueada no sale acá (como en
    // la referencia: «Main feed and search stay clear»).
    if (ch.type === 'paid' && !access && priv.paidLockedWhere !== 'feed') continue
    posts.push(await serializePost(event, r, user?.id ?? null, access, role))
  }

  const channelRows = await db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND (name LIKE ? OR description LIKE ?) ORDER BY sort LIMIT 10').all(tenant.id, like, like) as Record<string, unknown>[]
  const channels = []
  for (const c of channelRows) {
    const access = user ? await canAccessChannel(event, user.id, role, c as unknown as ChannelRow) : c.type === 'free'
    if (c.type === 'private' && !access) continue
    channels.push({ id: c.id, slug: c.slug, name: c.name, icon: c.icon, description: c.description, type: c.type, priceCents: c.price_cents, hasAccess: access })
  }

  // Fase 8: la búsqueda respeta la visibilidad como el catálogo
  // (los secretos no existen acá; los privados solo con sesión).
  const courseRows = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND status = \'published\' AND (title LIKE ? OR description LIKE ?) ORDER BY created_at LIMIT 10').all(tenant.id, like, like) as Record<string, unknown>[]
  const courses = courseRows
    .filter(c => courseListed(c as unknown as CourseRow, { loggedIn: !!user, isAdmin: role === 'admin' }))
    .map(c => ({ id: c.id, slug: c.slug, title: c.title, description: c.description, level: c.level, priceCents: c.price_cents }))

  // Fase 9: quien apagó «Aparecer en búsqueda» (user_prefs
  // show_in_search = '0') no sale como miembro; sus publicaciones y
  // comentarios de arriba siguen apareciendo igual.
  const memberRows = await db.prepare(`SELECT u.id, u.name, u.slug, u.bio, u.avatar_url FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
    WHERE u.name LIKE ?
    AND NOT EXISTS (SELECT 1 FROM user_prefs up WHERE up.tenant_id = ? AND up.user_id = u.id AND up.key = 'show_in_search' AND up.value = '0')
    LIMIT 10`).all(tenant.id, like, tenant.id) as Record<string, unknown>[]
  const members = memberRows.map(m => ({ id: m.id, name: m.name, slug: m.slug, bio: m.bio, avatarUrl: m.avatar_url || '' }))

  return { posts, channels, courses, members }
})
