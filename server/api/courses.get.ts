// Catálogo de cursos con búsqueda y conteos reales.
// Fase 8: respeta la visibilidad del curso — los secretos nunca se
// listan y los privados solo aparecen con sesión iniciada (ver
// utils/courses.courseListed). Las lecciones en borrador no cuentan.
import { currentAuth, resolveTenant } from '../utils/community'
import { requireSessionUnlessPublic } from '../utils/privacy'
import { courseListed } from '../utils/courses'
import type { CourseRow } from '../utils/courses'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  // Endurecimiento Fase 15: comunidad privada = el catálogo no se lee sin sesión.
  await requireSessionUnlessPublic(event, tenant.id, user)
  const q = String(getQuery(event).q || '').trim()
  const db = await dbFor(event)
  const rows = (q
    ? await db.prepare("SELECT * FROM courses WHERE tenant_id = ? AND status = 'published' AND (title LIKE ? OR description LIKE ? OR short_description LIKE ?) ORDER BY created_at").all(tenant.id, `%${q}%`, `%${q}%`, `%${q}%`)
    : await db.prepare("SELECT * FROM courses WHERE tenant_id = ? AND status = 'published' ORDER BY created_at").all(tenant.id)) as unknown as CourseRow[]
  const visible = rows.filter(c => courseListed(c, { loggedIn: !!user, isAdmin: role === 'admin' }))
  const courses = await Promise.all(visible.map(async (c) => {
    const chapters = (await db.prepare('SELECT COUNT(*) AS n FROM chapters WHERE course_id = ?').get(c.id) as unknown as { n: number }).n
    const lessons = (await db.prepare("SELECT COUNT(*) AS n FROM lessons WHERE chapter_id IN (SELECT id FROM chapters WHERE course_id = ?) AND status = 'published'").get(c.id) as unknown as { n: number }).n
    const enrolled = user ? !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, c.id, user.id) : false
    const done = user
      ? (await db.prepare(`SELECT COUNT(*) AS n FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
          WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ? AND l.status = 'published'`).get(c.id, user.id, tenant.id) as unknown as { n: number }).n
      : 0
    return {
      id: c.id, slug: c.slug, title: c.title,
      description: (c.short_description || '').trim() || c.description,
      shortDescription: c.short_description || '', level: c.level, priceCents: c.price_cents,
      imageUrl: c.image_url || '', bannerUrl: c.banner_url || '',
      chapters, lessons, enrolled,
      progress: { completed: done, total: lessons, pct: lessons ? Math.round((done / lessons) * 100) : 0 },
    }
  }))
  return { courses }
})
