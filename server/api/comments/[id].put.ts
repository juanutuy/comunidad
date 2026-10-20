// Editar un comentario propio (Fase 16-G): solo el texto y solo
// su autor. El adjunto no se edita desde acá (para cambiarlo se
// borra el comentario y se crea otro); el borrado sigue en
// [id].delete.ts con su cascada de respuestas y reacciones.
import { currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { msg } from '../../utils/i18n'
import { fetchCommentNode } from '../../utils/comments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  await currentAuth(event, tenant.id)
  const commentId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ body?: string }>(event)
  const text = (body.body || '').trim()
  const db = await dbFor(event)
  const comment = await db.prepare('SELECT author_id, media_type FROM comments WHERE id = ? AND tenant_id = ?').get(commentId, tenant.id) as { author_id: number, media_type?: string } | undefined
  if (!comment) throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.commentNotFound') })
  if (comment.author_id !== user.id)
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.commentEditOwn') })
  // Un comentario que ES solo un adjunto puede quedar sin texto;
  // uno de texto no puede quedar vacío al editarlo.
  if (!text && (!comment.media_type || comment.media_type === 'none'))
    throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.commentEmpty') })
  await requireCanWrite(event, tenant.id, user.id)
  await db.prepare('UPDATE comments SET body = ? WHERE id = ?').run(text, commentId)
  const node = await fetchCommentNode(event, commentId, user.id)
  return { ok: true, comment: node }
})
