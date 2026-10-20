// Reaccionar a un COMENTARIO (Fase 16-G): la misma semántica que
// en publicaciones — un emoji del catálogo por usuario; elegir lo
// crea, elegir otro lo reemplaza, elegir el mismo lo quita. Solo
// la creación avisa al autor del comentario (tipo
// 'comment_reaction', preferencia de reacciones) y solo la
// creación/quitado mueve su puntaje: los puntos se recalculan
// desde las filas (gamification 'comment_reaction', def. 1).
import { canAccessChannel, currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import type { ChannelRow } from '../../../utils/community'
import { dbFor, nowIso } from '../../../utils/db'
import { msg } from '../../../utils/i18n'
import { notify } from '../../../utils/notify'
import { isReactionType, summarizeReactionRows } from '../../../utils/reactions'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const commentId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ type?: string }>(event)
  if (!isReactionType(body.type)) throw createError({ statusCode: 400, message: 'Tipo de reacción inválido.' })
  const type = body.type
  await requireCanWrite(event, tenant.id, user.id)
  const db = await dbFor(event)
  const comment = await db.prepare(`SELECT c.author_id, c.post_id, p.title AS post_title, p.slug AS post_slug, p.status AS post_status, p.author_id AS post_author_id,
    ch.id AS channel_id, ch.slug AS channel_slug, ch.type AS channel_type
    FROM comments c JOIN posts p ON p.id = c.post_id JOIN channels ch ON ch.id = p.channel_id
    WHERE c.id = ? AND c.tenant_id = ?`).get(commentId, tenant.id) as { author_id: number, post_id: number, post_title: string, post_slug: string, post_status: string, post_author_id: number, channel_id: number, channel_slug: string, channel_type: string } | undefined
  if (!comment) throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.commentNotFound') })
  const postChannel = { id: comment.channel_id, tenant_id: tenant.id, group_id: null, slug: comment.channel_slug, name: '', icon: '', description: '', type: comment.channel_type, price_cents: 0 } as ChannelRow
  if (!(await canAccessChannel(event, user.id, role, postChannel)))
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.commentReactNoAccess') })
  if (comment.post_status !== 'published' && comment.post_author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.commentNotFound') })
  const mine = await db.prepare('SELECT id, type FROM comment_reactions WHERE comment_id = ? AND user_id = ?').get(commentId, user.id) as { id: number, type: string } | undefined
  let myReaction: string | null
  if (mine && mine.type === type) {
    await db.prepare('DELETE FROM comment_reactions WHERE id = ?').run(mine.id)
    myReaction = null
  }
  else if (mine) {
    await db.prepare('UPDATE comment_reactions SET type = ? WHERE id = ?').run(type, mine.id)
    myReaction = type
  }
  else {
    await db.prepare('INSERT INTO comment_reactions (tenant_id, comment_id, user_id, type, created_at) VALUES (?, ?, ?, ?, ?)').run(tenant.id, commentId, user.id, type, nowIso())
    myReaction = type
    await notify(event, {
      tenantId: tenant.id, userId: comment.author_id, actorId: user.id, type: 'comment_reaction',
      title: `${user.name} reaccionó ${type} a tu comentario en «${comment.post_title}»`,
      link: `/p/${comment.channel_slug}/${comment.post_slug}`,
    })
  }
  const counts = await db.prepare('SELECT type, COUNT(*) AS n FROM comment_reactions WHERE comment_id = ? GROUP BY type').all(commentId) as { type: string, n: number }[]
  const summary = summarizeReactionRows(counts)
  return { reactions: summary.counts, reactionTop: summary.top, reactionTotal: summary.total, myReaction }
})
