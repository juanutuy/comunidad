// Editar una lección (solo admin, Fase 5): título, contenido, URL de
// video, duración, si es gratuita y orden dentro del capítulo.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const lessonId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, content?: string, videoUrl?: string, durationMin?: number, isFree?: boolean, sort?: number }>(event)
  const title = (body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, message: 'La lección necesita un título.' })
  const db = await dbFor(event)
  const lesson = await db.prepare('SELECT id, sort FROM lessons WHERE id = ? AND tenant_id = ?').get(lessonId, tenant.id) as { id: number, sort: number } | undefined
  if (!lesson) throw createError({ statusCode: 404, message: 'Lección no encontrada.' })
  await db.prepare('UPDATE lessons SET title = ?, content = ?, video_url = ?, duration_min = ?, is_free = ?, sort = ? WHERE id = ?')
    .run(title, String(body.content || ''), String(body.videoUrl || '').trim(), Math.max(0, Math.round(Number(body.durationMin || 0))), body.isFree ? 1 : 0,
      body.sort !== undefined && Number.isFinite(Number(body.sort)) ? Number(body.sort) : lesson.sort, lessonId)
  return { ok: true }
})
