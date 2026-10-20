// Borrar un comentario: su autor o quien modera el tenant
// (administrador o moderador — Fase 14). Fase 16-G: el borrado va
// por la cascada compartida — una raíz se lleva sus respuestas y
// las reacciones de todos los comentarios eliminados.
import { canModerate, currentAuth, requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { deleteCommentCascade } from '../../utils/moderation'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const commentId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const comment = await db.prepare('SELECT author_id FROM comments WHERE id = ? AND tenant_id = ?').get(commentId, tenant.id) as { author_id: number } | undefined
  if (!comment) throw createError({ statusCode: 404, message: 'Comentario no encontrado.' })
  if (comment.author_id !== user.id && !canModerate(role))
    throw createError({ statusCode: 403, message: 'Solo el autor, un moderador o un administrador puede borrar este comentario.' })
  await deleteCommentCascade(event, commentId)
  return { ok: true }
})
