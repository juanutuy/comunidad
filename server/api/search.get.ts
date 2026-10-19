// Búsqueda global del tenant: publicaciones, canales, cursos y miembros.
// Respeta el acceso a canales: las publicaciones de canales pagos o
// privados sin acceso aparecen SOLO como teaser (igual que en el feed),
// nunca con el cuerpo completo.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import type { ChannelRow } from '../utils/community'
import { dbFor } from '../utils/db'
import { hiddenFilterSql } from '../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 2) return { posts: [], channels: [], courses: [], members: [] }
  const like = `%${q}%`
  const db = await dbFor(event)
  const { user, role } = await currentAuth(event, tenant.id)

  const hf = hiddenFilterSql(user?.id ?? null)
  const postRows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'published' AND (p.title LIKE ? OR p.body LIKE ?)${hf.sql} ORDER BY p.created_at DESC LIMIT 10`).all(tenant.id, like, like, ...hf.params) as Record<string, unknown>[]
  const posts = []
  for (const r of postRows) {
    const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    const access = await canAccessChannel(event, user?.id ?? null, role, ch)
    if (ch.type === 'private' && !access) continue // privado sin acceso: ni el teaser sale del canal
    posts.push(await serializePost(event, r, user?.id ?? null, access))
  }

  const channelRows = await db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND (name LIKE ? OR description LIKE ?) ORDER BY sort LIMIT 10').all(tenant.id, like, like) as Record<string, unknown>[]
  const channels = []
  for (const c of channelRows) {
    const access = user ? await canAccessChannel(event, user.id, role, c as unknown as ChannelRow) : c.type === 'free'
    if (c.type === 'private' && !access) continue
    channels.push({ id: c.id, slug: c.slug, name: c.name, icon: c.icon, description: c.description, type: c.type, priceCents: c.price_cents, hasAccess: access })
  }

  const courseRows = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND status = \'published\' AND (title LIKE ? OR description LIKE ?) ORDER BY created_at LIMIT 10').all(tenant.id, like, like) as Record<string, unknown>[]
  const courses = courseRows.map(c => ({ id: c.id, slug: c.slug, title: c.title, description: c.description, level: c.level, priceCents: c.price_cents }))

  const memberRows = await db.prepare(`SELECT u.id, u.name, u.slug, u.bio, u.avatar_url FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? WHERE u.name LIKE ? LIMIT 10`).all(tenant.id, like) as Record<string, unknown>[]
  const members = memberRows.map(m => ({ id: m.id, name: m.name, slug: m.slug, bio: m.bio, avatarUrl: m.avatar_url || '' }))

  return { posts, channels, courses, members }
})
