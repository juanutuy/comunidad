// Borrar una publicación: su autor o un admin del tenant (moderación).
// Se eliminan también sus reacciones, comentarios y guardados, y las
// notificaciones que apuntan a esa publicación quedan sin destino: se
// borran por su enlace para no dejar enlaces muertos.
import { currentAuth, requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.author_id, p.slug, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as { author_id: number, slug: string, channel_slug: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 403, message: 'Solo el autor o un administrador puede borrar esta publicación.' })
  await db.prepare('DELETE FROM poll_votes WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM poll_options WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM reactions WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM bookmarks WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM notifications WHERE tenant_id = ? AND link = ?').run(tenant.id, `/p/${post.channel_slug}/${post.slug}`)
  await db.prepare('DELETE FROM posts WHERE id = ?').run(postId)
  return { ok: true }
})
