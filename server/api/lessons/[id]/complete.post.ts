// Marcar/desmarcar una lección como completada (toggle).
// Requiere sesión y poder ver la lección: gratuita o estar inscrito.
// Fase 8: además respeta la disponibilidad — una lección bloqueada
// por drip o por prerrequisito NO se puede completar (así el avance
// nunca cuenta como hechas lecciones que todavía no se liberaron).
import { requireUser, resolveTenant } from '../../../utils/community'
import { completedLessonIds, courseCurriculum, enrollmentOf, flattenLessons, lessonAvailability } from '../../../utils/courses'
import type { CourseRow } from '../../../utils/courses'
import { nowIso, dbFor } from '../../../utils/db'
import { awardPoints } from '../../../utils/points'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const lessonId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const lessonRow = await db.prepare(`SELECT l.*, ch.course_id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE l.id = ? AND l.tenant_id = ?`).get(lessonId, tenant.id) as Record<string, unknown> | undefined
  if (!lessonRow || lessonRow.status === 'draft') throw createError({ statusCode: 404, message: 'Lección no encontrada.' })
  const courseId = Number(lessonRow.course_id)
  const course = await db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as unknown as CourseRow
  const enrollment = await enrollmentOf(event, tenant.id, courseId, user.id)
  if (!lessonRow.is_free && !enrollment)
    throw createError({ statusCode: 403, message: 'Inscribite al curso para registrar tu avance.' })
  const existing = await db.prepare('SELECT id FROM lesson_progress WHERE tenant_id = ? AND user_id = ? AND lesson_id = ?').get(tenant.id, user.id, lessonId)
  // El candado solo impide COMPLETAR (desmarcar una ya hecha siempre
  // se puede, por si cambió la configuración después).
  if (!existing) {
    const curriculum = await courseCurriculum(event, courseId)
    const flat = flattenLessons(curriculum)
    const idx = flat.findIndex(l => Number(l.id) === lessonId)
    const completedIds = await completedLessonIds(event, tenant.id, courseId, user.id)
    const availability = lessonAvailability(course, flat[idx]!, {
      isAdmin: false, enrolledAt: enrollment?.created_at ?? null,
      completedIds, prevLessonId: idx > 0 ? Number(flat[idx - 1]!.id) : null,
    })
    if (availability.locked) {
      throw createError({
        statusCode: 403,
        message: availability.reason === 'prerequisite'
          ? 'Completá primero la lección anterior para habilitar esta.'
          : 'Esta lección todavía no está disponible.',
      })
    }
  }
  if (existing) await db.prepare('DELETE FROM lesson_progress WHERE id = ?').run((existing as { id: number }).id)
  else await db.prepare('INSERT INTO lesson_progress (tenant_id, user_id, lesson_id, completed_at) VALUES (?, ?, ?, ?)').run(tenant.id, user.id, lessonId, nowIso())
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ? AND l.status = 'published') AS total,
      (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
       WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ? AND l.status = 'published') AS done`)
    .get(courseId, courseId, user.id, tenant.id) as unknown as { total: number, done: number }
  // Fase 5: +50 puntos al completar el curso entero (una sola vez).
  if (!existing && totals.total > 0 && totals.done >= totals.total)
    await awardPoints(event, tenant.id, user.id, 'course_complete', courseId).catch(() => {})
  return { completed: !existing, progress: { completed: totals.done, total: totals.total, pct: totals.total ? Math.round((totals.done / totals.total) * 100) : 0 } }
})
