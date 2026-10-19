// Datos del certificado: solo si el usuario completó el 100% del curso.
// La fecha de finalización es la última lección completada.
import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as Record<string, unknown> | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ?) AS total,
      (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
       WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ?) AS done,
      (SELECT MAX(lp.completed_at) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
       WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ?) AS finished_at`)
    .get(course.id, course.id, user.id, tenant.id, course.id, user.id, tenant.id) as unknown as { total: number, done: number, finished_at: string | null }
  const eligible = totals.total > 0 && totals.done >= totals.total
  return {
    eligible,
    progress: { completed: totals.done, total: totals.total, pct: totals.total ? Math.round((totals.done / totals.total) * 100) : 0 },
    certificate: eligible
      ? { memberName: user.name, courseTitle: course.title, communityName: tenant.name, finishedAt: totals.finished_at }
      : null,
  }
})
