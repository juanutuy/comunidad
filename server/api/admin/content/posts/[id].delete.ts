// Eliminar desde la tabla de Contenido (Fase 16): usa la MISMA
// cascada compartida que el borrado normal y que Moderación
// (deletePostCascade: reacciones, comentarios, guardados, votos de
// encuesta y notificaciones enlazadas). Acceso: admin y moderator.
import { requireModerator, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'
import { deletePostCascade } from '../../../../utils/moderation'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare('SELECT p.slug, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?')
    .get(postId, tenant.id) as { slug: string, channel_slug: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  await deletePostCascade(event, tenant.id, postId, post.channel_slug, post.slug)
  return { ok: true, id: postId }
})
