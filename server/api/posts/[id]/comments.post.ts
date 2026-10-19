// Comentar una publicación (solo miembros con sesión).
// Se notifica al autor de la publicación y a quienes sean mencionados.
import { currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'
import { assertGate, containsLink } from '../../../utils/members'
import { notify, notifyMentions } from '../../../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ body?: string }>(event)
  const text = (body.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El comentario no puede estar vacío.' })
  // Fase 14: restricción de escritura y compuerta de enlaces del feed.
  await requireCanWrite(event, tenant.id, user.id)
  if (containsLink(text)) await assertGate(event, tenant.id, user.id, role, 'feed_link')
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.author_id, p.title, p.slug, p.status, p.allow_comments, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as { author_id: number, title: string, slug: string, status: string, allow_comments: number, channel_slug: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  // Fase 12: en un post que no está publicado (p. ej. en revisión)
  // solo pueden comentar su autor y los admins; para el resto no existe.
  if (post.status !== 'published' && post.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  // Fase 7: el autor pudo desactivar los comentarios al publicar.
  if (post.allow_comments === 0)
    throw createError({ statusCode: 403, message: 'Los comentarios están desactivados en esta publicación.' })
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
