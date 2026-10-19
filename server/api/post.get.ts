// Detalle de una publicación por canal+slug, con comentarios.
// Sin acceso al canal: solo teaser (locked).
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const q = getQuery(event)
  const channel = await channelBySlug(event, tenant.id, String(q.channel || ''))
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const db = await dbFor(event)
  const row = await db.prepare(`${POST_SELECT} WHERE p.channel_id = ? AND p.slug = ?`).get(channel.id, String(q.post || '')) as Record<string, unknown> | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const { user, role } = await currentAuth(event, tenant.id)
  const access = await canAccessChannel(event, user?.id ?? null, role, channel)
  const comments = access
    ? (await db.prepare(`SELECT c.*, u.name AS author_name, u.slug AS author_slug FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at`).all(row.id as number) as Record<string, unknown>[])
        .map(c => ({ id: c.id, body: c.body, createdAt: c.created_at, author: { name: c.author_name, slug: c.author_slug } }))
    : []
  return { post: await serializePost(event, row, user?.id ?? null, access), comments }
})
