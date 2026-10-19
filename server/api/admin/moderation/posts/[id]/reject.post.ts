// Rechazar una publicación en revisión (Fase 12, solo admin): NO se
// borra — vuelve a los BORRADORES del autor, que puede editarla y
// reenviarla (al publicarla con la revisión encendida vuelve a
// 'review'). El autor recibe su notificación 'moderation'.
import { requireAdmin, resolveTenant } from '../../../../../utils/community'
import { dbFor } from '../../../../../utils/db'
import { notify } from '../../../../../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare('SELECT id, status, author_id FROM posts WHERE id = ? AND tenant_id = ?')
    .get(postId, tenant.id) as { id: number, status: string, author_id: number } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.status !== 'review') throw createError({ statusCode: 409, message: 'Esta publicación ya no está en revisión.' })
  await db.prepare("UPDATE posts SET status = 'draft' WHERE id = ?").run(postId)
  await notify(event, {
    tenantId: tenant.id, userId: post.author_id, actorId: null, type: 'moderation',
    title: 'Tu publicación no fue aprobada y volvió a tus borradores',
    link: '/drafts',
  })
  return { ok: true }
})
