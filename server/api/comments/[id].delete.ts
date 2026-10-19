// Borrar un comentario: su autor o un admin del tenant (moderación).
import { currentAuth, requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const commentId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const comment = await db.prepare('SELECT author_id FROM comments WHERE id = ? AND tenant_id = ?').get(commentId, tenant.id) as { author_id: number } | undefined
  if (!comment) throw createError({ statusCode: 404, message: 'Comentario no encontrado.' })
  if (comment.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 403, message: 'Solo el autor o un administrador puede borrar este comentario.' })
  await db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)
  return { ok: true }
})
