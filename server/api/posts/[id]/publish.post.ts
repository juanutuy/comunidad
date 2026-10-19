// Publicar ahora un borrador o un programado propio (Fase 5).
// Al pasar a publicado se comporta como una publicación nueva:
// fecha actual y notificaciones a seguidores y mencionados.
// Fase 12: con la revisión previa encendida, publicar un borrador de
// un miembro NO admin lo manda a 'review' (no a 'published'): así un
// post rechazado que vuelve a borradores y se reenvía pasa otra vez
// por la cola. Si quien publica es admin, sale directo.
import { currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'
import { getReviewEnabled } from '../../../utils/moderation'
import { notifyNewPost } from '../../../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.*, c.slug AS channel_slug, c.name AS channel_name FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`)
    .get(postId, tenant.id) as Record<string, unknown> | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 403, message: 'Solo el autor puede publicar este borrador.' })
  // Fase 14: publicar es participar — no con la cuenta restringida.
  await requireCanWrite(event, tenant.id, user.id)
  if (post.status === 'published') return { ok: true, already: true }
  if (role !== 'admin' && await getReviewEnabled(event, tenant.id)) {
    await db.prepare("UPDATE posts SET status = 'review', scheduled_at = '' WHERE id = ?").run(postId)
    return { ok: true, review: true, slug: post.slug, channelSlug: post.channel_slug }
  }
  await db.prepare("UPDATE posts SET status = 'published', scheduled_at = '', created_at = ? WHERE id = ?").run(nowIso(), postId)
  await notifyNewPost(event, tenant.id, { id: Number(post.author_id), name: String((await db.prepare('SELECT name FROM users WHERE id = ?').get(post.author_id) as { name: string }).name) },
    { id: Number(post.channel_id), name: String(post.channel_name) },
    { title: String(post.title), body: String(post.body), slug: String(post.slug) }, String(post.channel_slug),
    { anonymous: !!post.anonymous })
  return { ok: true, slug: post.slug, channelSlug: post.channel_slug }
})
