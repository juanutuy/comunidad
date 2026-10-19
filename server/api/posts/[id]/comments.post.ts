// Comentar una publicación (solo miembros con sesión).
// Se notifica al autor de la publicación y a quienes sean mencionados.
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'
import { notify, notifyMentions } from '../../../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ body?: string }>(event)
  const text = (body.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El comentario no puede estar vacío.' })
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.author_id, p.title, p.slug, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as { author_id: number, title: string, slug: string, channel_slug: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const id = Number((await db.prepare('INSERT INTO comments (tenant_id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, postId, user.id, text, nowIso())).lastInsertRowId)
  const link = `/p/${post.channel_slug}/${post.slug}`
  await notify(event, {
    tenantId: tenant.id, userId: post.author_id, actorId: user.id, type: 'comment',
    title: `${user.name} comentó tu publicación «${post.title}»`, link,
  })
  await notifyMentions(event, tenant.id, user, text, link, [post.author_id])
  return { id, body: text, author: { name: user.name, slug: user.slug } }
})
