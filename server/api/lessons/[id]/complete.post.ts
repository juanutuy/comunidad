// Marcar/desmarcar una lección como completada (toggle).
// Requiere sesión y poder ver la lección: gratuita o estar inscrito.
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'
import { awardPoints } from '../../../utils/points'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const lessonId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const lesson = await db.prepare(`SELECT l.is_free, ch.course_id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE l.id = ? AND l.tenant_id = ?`).get(lessonId, tenant.id) as { is_free: number, course_id: number } | undefined
  if (!lesson) throw createError({ statusCode: 404, message: 'Lección no encontrada.' })
  if (!lesson.is_free) {
    const enrolled = !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, lesson.course_id, user.id)
    if (!enrolled) throw createError({ statusCode: 403, message: 'Inscribite al curso para registrar tu avance.' })
  }
  const existing = await db.prepare('SELECT id FROM lesson_progress WHERE tenant_id = ? AND user_id = ? AND lesson_id = ?').get(tenant.id, user.id, lessonId)
  if (existing) await db.prepare('DELETE FROM lesson_progress WHERE id = ?').run((existing as { id: number }).id)
  else await db.prepare('INSERT INTO lesson_progress (tenant_id, user_id, lesson_id, completed_at) VALUES (?, ?, ?, ?)').run(tenant.id, user.id, lessonId, nowIso())
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ?) AS total,
      (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
       WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ?) AS done`)
    .get(lesson.course_id, lesson.course_id, user.id, tenant.id) as unknown as { total: number, done: number }
  // Fase 5: +50 puntos al completar el curso entero (una sola vez).
  if (!existing && totals.total > 0 && totals.done >= totals.total)
    await awardPoints(event, tenant.id, user.id, 'course_complete', lesson.course_id).catch(() => {})
  return { completed: !existing, progress: { completed: totals.done, total: totals.total, pct: totals.total ? Math.round((totals.done / totals.total) * 100) : 0 } }
})
