// Borrar un capítulo (solo admin, Fase 5): caen sus lecciones y el
// progreso registrado sobre ellas.
import { requireCourseManager, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const chapterId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const chapter = await db.prepare('SELECT id FROM chapters WHERE id = ? AND tenant_id = ?').get(chapterId, tenant.id)
  if (!chapter) throw createError({ statusCode: 404, message: 'Capítulo no encontrado.' })
  await db.prepare('DELETE FROM lesson_progress WHERE tenant_id = ? AND lesson_id IN (SELECT id FROM lessons WHERE chapter_id = ?)').run(tenant.id, chapterId)
  await db.prepare('DELETE FROM lessons WHERE chapter_id = ?').run(chapterId)
  await db.prepare('DELETE FROM chapters WHERE id = ?').run(chapterId)
  return { ok: true }
})
