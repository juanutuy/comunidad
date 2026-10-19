// Detalle de curso con currículum (capítulos y lecciones).
import { currentAuth, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as Record<string, unknown> | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  // Fase 5: un curso en borrador no existe para el público (el admin sí lo abre).
  if (course.status === 'draft' && role !== 'admin') throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const enrolled = user ? !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id) : false
  const completedIds = new Set(user
    ? (await db.prepare(`SELECT lp.lesson_id FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
        WHERE lp.tenant_id = ? AND lp.user_id = ? AND ch.course_id = ?`).all(tenant.id, user.id, course.id) as { lesson_id: number }[]).map(r => r.lesson_id)
    : [])
  const chapterRows = await db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort').all(course.id) as Record<string, unknown>[]
  let totalLessons = 0
  const chapters = await Promise.all(chapterRows.map(async (ch) => {
    const lessons = (await db.prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY sort').all(ch.id) as Record<string, unknown>[])
      .map(l => ({ id: l.id, title: l.title, durationMin: l.duration_min, isFree: !!l.is_free, completed: completedIds.has(l.id as number), canView: !!l.is_free || enrolled }))
    totalLessons += lessons.length
    return { id: ch.id, title: ch.title, lessons }
  }))
  const completedCount = completedIds.size
  const progressPct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0
  return {
    course: {
      id: course.id, slug: course.slug, title: course.title, description: course.description, level: course.level, priceCents: course.price_cents, imageUrl: (course.image_url as string) || '', enrolled,
      progress: { completed: completedCount, total: totalLessons, pct: progressPct },
    },
    chapters,
  }
})
