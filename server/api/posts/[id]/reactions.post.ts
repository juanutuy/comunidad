// Reaccionar a una publicación (toggle por tipo: love/like/fire/clap).
// Al AGREGAR una reacción se notifica al autor de la publicación.
import { currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'
import { notify } from '../../../utils/notify'

const TYPES = ['love', 'like', 'fire', 'clap']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ type?: string }>(event)
  if (!TYPES.includes(body.type || '')) throw createError({ statusCode: 400, message: 'Tipo de reacción inválido.' })
  // Fase 14: un miembro restringido lee pero no participa.
  await requireCanWrite(event, tenant.id, user.id)
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.author_id, p.title, p.slug, p.status, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as { author_id: number, title: string, slug: string, status: string, channel_slug: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  // Fase 12: en un post que no está publicado (p. ej. en revisión)
  // solo pueden reaccionar su autor y los admins.
  if (post.status !== 'published' && post.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const existing = await db.prepare('SELECT id FROM reactions WHERE post_id = ? AND user_id = ? AND type = ?').get(postId, user.id, body.type)
  if (existing) await db.prepare('DELETE FROM reactions WHERE id = ?').run((existing as { id: number }).id)
  else {
    await db.prepare('INSERT INTO reactions (tenant_id, post_id, user_id, type) VALUES (?, ?, ?, ?)').run(tenant.id, postId, user.id, body.type)
    await notify(event, {
      tenantId: tenant.id, userId: post.author_id, actorId: user.id, type: 'reaction',
      title: `${user.name} reaccionó a tu publicación «${post.title}»`,
      link: `/p/${post.channel_slug}/${post.slug}`,
    })
  }
  const counts = await db.prepare('SELECT type, COUNT(*) AS n FROM reactions WHERE post_id = ? GROUP BY type').all(postId)
  return { reactions: counts, active: !existing }
})
