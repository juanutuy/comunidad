// Borrar un curso (solo admin, Fase 5): se limpian en cascada sus
// capítulos, lecciones, progresos e inscripciones. Los pagos ya
// registrados NO se borran (son el historial financiero del tenant).
import { requireCourseManager, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id)
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  await db.prepare('DELETE FROM point_events WHERE tenant_id = ? AND kind IN (\'course_enroll\', \'course_complete\') AND ref_id = ?').run(tenant.id, courseId)
  await db.prepare(`DELETE FROM lesson_progress WHERE tenant_id = ? AND lesson_id IN (SELECT l.id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ?)`).run(tenant.id, courseId)
  await db.prepare('DELETE FROM lessons WHERE chapter_id IN (SELECT id FROM chapters WHERE course_id = ?)').run(courseId)
  await db.prepare('DELETE FROM chapters WHERE course_id = ?').run(courseId)
  await db.prepare('DELETE FROM enrollments WHERE tenant_id = ? AND course_id = ?').run(tenant.id, courseId)
  await db.prepare('DELETE FROM courses WHERE id = ?').run(courseId)
  return { ok: true }
})
