// Detalle de una publicación por canal+slug, con comentarios.
// Sin acceso al canal: solo teaser (locked).
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { rawDb } from '../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const q = getQuery(event)
  const channel = channelBySlug(tenant.id, String(q.channel || ''))
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const db = rawDb()
  const row = db.prepare(`${POST_SELECT} WHERE p.channel_id = ? AND p.slug = ?`).get(channel.id, String(q.post || '')) as Record<string, unknown> | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const { user, role } = currentAuth(event, tenant.id)
  const access = canAccessChannel(user?.id ?? null, role, channel)
  const comments = access
    ? (db.prepare(`SELECT c.*, u.name AS author_name, u.slug AS author_slug FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at`).all(row.id as number) as Record<string, unknown>[])
        .map(c => ({ id: c.id, body: c.body, createdAt: c.created_at, author: { name: c.author_name, slug: c.author_slug } }))
    : []
  return { post: serializePost(row, user?.id ?? null, access), comments }
})
