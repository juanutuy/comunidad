// Visor de lección: devuelve el contenido si la lección es gratuita o el
// usuario está inscrito en el curso; si no, 403 con los datos básicos.
import { currentAuth, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const lessonId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as Record<string, unknown> | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const { role: courseRole } = await currentAuth(event, tenant.id)
  if (course.status === 'draft' && courseRole !== 'admin') throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const lesson = await db.prepare(`SELECT l.*, ch.title AS chapter_title FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE l.id = ? AND ch.course_id = ?`).get(lessonId, course.id) as Record<string, unknown> | undefined
  if (!lesson) throw createError({ statusCode: 404, message: 'Lección no encontrada.' })
  const { user } = await currentAuth(event, tenant.id)
  const enrolled = user ? !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id) : false
  const canView = !!lesson.is_free || enrolled
  const completed = user ? !!await db.prepare('SELECT id FROM lesson_progress WHERE tenant_id = ? AND user_id = ? AND lesson_id = ?').get(tenant.id, user.id, lessonId) : false
  // Navegación anterior/siguiente dentro del curso (orden del currículum).
  const all = await db.prepare(`SELECT l.id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ? ORDER BY ch.sort, l.sort`).all(course.id) as { id: number }[]
  const idx = all.findIndex(l => l.id === lessonId)
  return {
    course: { slug: course.slug, title: course.title, enrolled },
    lesson: {
      id: lesson.id, title: lesson.title, chapterTitle: lesson.chapter_title, durationMin: lesson.duration_min,
      isFree: !!lesson.is_free, content: canView ? lesson.content : '', videoUrl: canView ? (lesson.video_url as string || '') : '', canView, completed,
    },
    prevId: idx > 0 ? all[idx - 1]!.id : null,
    nextId: idx >= 0 && idx < all.length - 1 ? all[idx + 1]!.id : null,
  }
})
