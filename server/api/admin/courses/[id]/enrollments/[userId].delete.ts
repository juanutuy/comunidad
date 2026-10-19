// Quitar la inscripción de un miembro (solo admin, Fase 8). También
// se borra su avance en este curso: sin inscripción no hay progreso
// que conservar (los puntos ya otorgados no se revierten).
import { requireCourseManager, resolveTenant } from '../../../../../utils/community'
import { dbFor } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const userId = Number(getRouterParam(event, 'userId'))
  const db = await dbFor(event)
  await db.prepare('DELETE FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').run(tenant.id, courseId, userId)
  await db.prepare(`DELETE FROM lesson_progress WHERE tenant_id = ? AND user_id = ? AND lesson_id IN
    (SELECT l.id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ?)`).run(tenant.id, userId, courseId)
  return { ok: true }
})
