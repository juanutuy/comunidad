// Activar / desactivar los comentarios de una publicación (Fase
// 16-B, desde el menú «…» de la tarjeta). Es la misma columna
// allow_comments que el autor puede fijar al publicar (Fase 7): la API
// de comentarios ya la respeta con su 403. Acá la cambian el AUTOR o
// el staff que modera (admin/moderator); nadie más.
import { canModerate, currentAuth, requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const row = await db.prepare('SELECT author_id, allow_comments FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { author_id: number, allow_comments: number } | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (row.author_id !== user.id && !canModerate(role))
    throw createError({ statusCode: 403, message: 'Solo el autor o un moderador puede cambiar los comentarios de esta publicación.' })
  const next = row.allow_comments === 0 ? 1 : 0
  await db.prepare('UPDATE posts SET allow_comments = ? WHERE id = ?').run(next, postId)
  return { allowComments: next === 1 }
})
