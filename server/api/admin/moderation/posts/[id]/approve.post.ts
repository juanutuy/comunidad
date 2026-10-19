// Aprobar una publicación en revisión (Fase 12, solo admin): pasa a
// 'published' con fecha actual — como publicar un borrador — así
// recién ahí suma los puntos de publicación (memberStats solo cuenta
// posts 'published'), se avisa a seguidores y mencionados como una
// publicación nueva, y el autor recibe su notificación 'moderation'.
import { requireAdmin, resolveTenant } from '../../../../../utils/community'
import { nowIso, dbFor } from '../../../../../utils/db'
import { notify, notifyNewPost } from '../../../../../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.*, c.slug AS channel_slug, c.name AS channel_name FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`)
    .get(postId, tenant.id) as Record<string, unknown> | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.status !== 'review') throw createError({ statusCode: 409, message: 'Esta publicación ya no está en revisión.' })
  await db.prepare("UPDATE posts SET status = 'published', created_at = ? WHERE id = ?").run(nowIso(), postId)
  const author = await db.prepare('SELECT name FROM users WHERE id = ?').get(Number(post.author_id)) as { name: string } | undefined
  await notifyNewPost(event, tenant.id, { id: Number(post.author_id), name: author?.name || '' },
    { id: Number(post.channel_id), name: String(post.channel_name) },
    { title: String(post.title), body: String(post.body), slug: String(post.slug) }, String(post.channel_slug),
    { anonymous: !!post.anonymous })
  await notify(event, {
    tenantId: tenant.id, userId: Number(post.author_id), actorId: null, type: 'moderation',
    title: 'Tu publicación fue aprobada',
    link: `/p/${post.channel_slug}/${post.slug}`,
  })
  return { ok: true }
})
