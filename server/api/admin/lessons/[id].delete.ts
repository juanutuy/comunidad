// Borrar una lección (solo admin, Fase 5) y su progreso asociado.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const lessonId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const lesson = await db.prepare('SELECT id FROM lessons WHERE id = ? AND tenant_id = ?').get(lessonId, tenant.id)
  if (!lesson) throw createError({ statusCode: 404, message: 'Lección no encontrada.' })
  await db.prepare('DELETE FROM lesson_progress WHERE tenant_id = ? AND lesson_id = ?').run(tenant.id, lessonId)
  await db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId)
  return { ok: true }
})
