// Reaccionar a una publicación (Fase 16-G): UNA reacción por
// usuario, un emoji del catálogo (utils/reactions.ts). Elegir un
// emoji sin tener ninguno lo crea; elegir OTRO lo reemplaza; elegir
// el MISMO lo quita. Solo la CREACIÓN (de ninguno a uno) notifica al
// autor y suma en su puntaje: los puntos por reacción se recalculan
// desde las filas (gamification 'reaction_received'), así que
// reemplazar no cambia ningún conteo y quitar la reacción lo resta.
import { canAccessChannel, currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import type { ChannelRow } from '../../../utils/community'
import { dbFor, nowIso } from '../../../utils/db'
import { notify } from '../../../utils/notify'
import { isReactionType, summarizeReactionRows } from '../../../utils/reactions'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ type?: string }>(event)
  if (!isReactionType(body.type)) throw createError({ statusCode: 400, message: 'Tipo de reacción inválido.' })
  const type = body.type
  // Fase 14: un miembro restringido lee pero no participa.
  await requireCanWrite(event, tenant.id, user.id)
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.author_id, p.title, p.slug, p.status, c.id AS channel_id, c.slug AS channel_slug, c.type AS channel_type FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as { author_id: number, title: string, slug: string, status: string, channel_id: number, channel_slug: string, channel_type: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  // Fase 15: como en los comentarios, reaccionar exige el acceso real
  // al canal — leer un anticipo completo no alcanza para participar.
  const postChannel = { id: post.channel_id, tenant_id: tenant.id, group_id: null, slug: post.channel_slug, name: '', icon: '', description: '', type: post.channel_type, price_cents: 0 } as ChannelRow
  if (!(await canAccessChannel(event, user.id, role, postChannel)))
    throw createError({ statusCode: 403, message: 'Necesitás acceso a este canal para reaccionar a esta publicación.' })
  // Fase 12: en un post que no está publicado (p. ej. en revisión)
  // solo pueden reaccionar su autor y los admins.
  if (post.status !== 'published' && post.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const mine = await db.prepare('SELECT id, type FROM reactions WHERE post_id = ? AND user_id = ?').get(postId, user.id) as { id: number, type: string } | undefined
  let myReaction: string | null
  if (mine && mine.type === type) {
    await db.prepare('DELETE FROM reactions WHERE id = ?').run(mine.id)
    myReaction = null
  }
  else if (mine) {
    await db.prepare('UPDATE reactions SET type = ? WHERE id = ?').run(type, mine.id)
    myReaction = type
  }
  else {
    await db.prepare('INSERT INTO reactions (tenant_id, post_id, user_id, type) VALUES (?, ?, ?, ?)').run(tenant.id, postId, user.id, type)
    myReaction = type
    await notify(event, {
      tenantId: tenant.id, userId: post.author_id, actorId: user.id, type: 'reaction',
      title: `${user.name} reaccionó ${type} a tu publicación «${post.title}»`,
      link: `/p/${post.channel_slug}/${post.slug}`,
    })
  }
  const counts = await db.prepare('SELECT type, COUNT(*) AS n FROM reactions WHERE post_id = ? GROUP BY type').all(postId) as { type: string, n: number }[]
  const summary = summarizeReactionRows(counts)
  return { reactions: summary.counts, reactionTop: summary.top, reactionTotal: summary.total, myReaction, changedAt: nowIso() }
})
