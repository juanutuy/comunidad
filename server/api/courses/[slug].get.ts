// Detalle de curso con currículum (capítulos y lecciones).
import { currentAuth, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as Record<string, unknown> | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const { user } = await currentAuth(event, tenant.id)
  const enrolled = user ? !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id) : false
  const chapterRows = await db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort').all(course.id) as Record<string, unknown>[]
  const chapters = await Promise.all(chapterRows.map(async ch => ({
    id: ch.id, title: ch.title,
    lessons: (await db.prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY sort').all(ch.id) as Record<string, unknown>[])
      .map(l => ({ id: l.id, title: l.title, durationMin: l.duration_min, isFree: !!l.is_free })),
  })))
  return {
    course: { id: course.id, slug: course.slug, title: course.title, description: course.description, level: course.level, priceCents: course.price_cents, enrolled },
    chapters,
  }
})
