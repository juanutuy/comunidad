// Inscritos de un curso para la pestaña Enrollments del estudio
// (solo admin, Fase 8): miembro, fecha y avance real calculado
// sobre las lecciones publicadas del curso.
import { requireCourseManager, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id)
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id
    WHERE ch.course_id = ? AND l.status = 'published'`).get(courseId) as { n: number }).n
  const rows = await db.prepare(`SELECT e.id, e.created_at, u.id AS user_id, u.name, u.slug, u.email, u.avatar_url
    FROM enrollments e JOIN users u ON u.id = e.user_id
    WHERE e.tenant_id = ? AND e.course_id = ? ORDER BY e.created_at`).all(tenant.id, courseId) as Record<string, unknown>[]
  const enrollments = []
  for (const r of rows) {
    const done = (await db.prepare(`SELECT COUNT(*) AS n FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
      WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ? AND l.status = 'published'`).get(courseId, r.user_id, tenant.id) as { n: number }).n
    enrollments.push({
      id: r.id, userId: r.user_id, name: r.name, slug: r.slug, email: r.email, avatarUrl: r.avatar_url || '',
      enrolledAt: r.created_at, progress: { completed: done, total, pct: total ? Math.round((done / total) * 100) : 0 },
    })
  }
  return { enrollments, totalLessons: total }
})
