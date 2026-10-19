// Publicar desde la tabla de Contenido (Fase 16): un borrador o un
// programado pasa a publicado AHORA por decisión del staff (admin o
// moderator). Es la acción «Publicar» del menú de fila de la
// referencia. No pasa por la revisión previa: quien publica es el
// propio equipo que revisa.
import { requireModerator, resolveTenant } from '../../../../../utils/community'
import { dbFor, nowIso } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare('SELECT id, status FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { id: number, status: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.status === 'published') throw createError({ statusCode: 400, message: 'La publicación ya está publicada.' })
  if (post.status === 'review') throw createError({ statusCode: 400, message: 'Esta publicación está en revisión: resolvela desde Moderación.' })
  await db.prepare("UPDATE posts SET status = 'published', scheduled_at = '', created_at = ? WHERE id = ?").run(nowIso(), postId)
  return { ok: true, id: postId, status: 'published' }
})
