// Inscribir manualmente a un miembro (solo admin, Fase 8 — pestaña
// Enrollments del estudio). Respeta el límite de inscritos del curso
// igual que la inscripción pública: si el curso está lleno, el admin
// puede subir el límite desde Settings.
import { requireCourseManager, resolveTenant } from '../../../../utils/community'
import { nowIso, dbFor } from '../../../../utils/db'
import { awardPoints } from '../../../../utils/points'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ userId?: number }>(event)
  const userId = Number(body.userId || 0)
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id, enroll_limit FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id) as { id: number, enroll_limit?: number } | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const member = await db.prepare('SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? WHERE u.id = ?').get(tenant.id, userId)
  if (!member) throw createError({ statusCode: 404, message: 'Ese miembro no pertenece a esta comunidad.' })
  const already = await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, courseId, userId)
  if (already) return { enrolled: true, already: true }
  const limit = Number(course.enroll_limit || 0)
  if (limit > 0) {
    const count = (await db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE tenant_id = ? AND course_id = ?').get(tenant.id, courseId) as { n: number }).n
    if (count >= limit) throw createError({ statusCode: 400, message: 'El curso alcanzó su límite de inscritos. Subilo desde Settings si hace falta.' })
  }
  await db.prepare('INSERT INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, courseId, userId, nowIso())
  await awardPoints(event, tenant.id, userId, 'course_enroll', courseId).catch(() => {})
  return { enrolled: true }
})
