// Perfil público de un miembro: datos, sus publicaciones, comentarios y canales.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const user = await db.prepare('SELECT * FROM users WHERE slug = ?').get(slug) as Record<string, unknown> | undefined
  if (!user) throw createError({ statusCode: 404, message: 'Miembro no encontrado.' })
  const { user: me, role } = await currentAuth(event, tenant.id)
  const postRows = await db.prepare(`${POST_SELECT} WHERE p.author_id = ? AND p.tenant_id = ? ORDER BY p.created_at DESC`).all(user.id, tenant.id) as Record<string, unknown>[]
  const posts = []
  for (const r of postRows) {
    const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    const access = await canAccessChannel(event, me?.id ?? null, role, ch)
    if (ch.type === 'free' || access) posts.push(await serializePost(event, r, me?.id ?? null, access))
  }
  const comments = await db.prepare(`SELECT c.body, c.created_at, p.title AS post_title, p.slug AS post_slug, ch.slug AS channel_slug
    FROM comments c JOIN posts p ON p.id = c.post_id JOIN channels ch ON ch.id = p.channel_id
    WHERE c.author_id = ? AND c.tenant_id = ? ORDER BY c.created_at DESC LIMIT 20`).all(user.id, tenant.id)
  const channels = await db.prepare(`SELECT c.name, c.slug FROM follows f JOIN channels c ON c.id = f.channel_id WHERE f.tenant_id = ? AND f.user_id = ?`).all(tenant.id, user.id)
  return {
    profile: { id: user.id, name: user.name, slug: user.slug, bio: user.bio, location: user.location, memberSince: user.created_at },
    posts, comments, channels,
  }
})
