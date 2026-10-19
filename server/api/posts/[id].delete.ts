// Borrar una publicación: su autor o un admin del tenant (moderación).
// Se eliminan también sus reacciones, comentarios y guardados, y las
// notificaciones que apuntan a esa publicación quedan sin destino: se
// borran por su enlace para no dejar enlaces muertos.
import { currentAuth, requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { deletePostCascade } from '../../utils/moderation'

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
  // Fase 12: la cascada vive en utils/moderation para que «Eliminar
  // contenido» desde la cola de reportes borre exactamente igual.
  await deletePostCascade(event, tenant.id, postId, post.channel_slug, post.slug)
  return { ok: true }
})
