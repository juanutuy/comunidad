// Catálogo de cursos con búsqueda y conteos reales.
import { currentAuth, resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user } = await currentAuth(event, tenant.id)
  const q = String(getQuery(event).q || '').trim()
  const db = await dbFor(event)
  const rows = (q
    ? await db.prepare("SELECT * FROM courses WHERE tenant_id = ? AND status = 'published' AND (title LIKE ? OR description LIKE ?) ORDER BY created_at").all(tenant.id, `%${q}%`, `%${q}%`)
    : await db.prepare("SELECT * FROM courses WHERE tenant_id = ? AND status = 'published' ORDER BY created_at").all(tenant.id)) as Record<string, unknown>[]
  const courses = await Promise.all(rows.map(async (c) => {
    const chapters = (await db.prepare('SELECT COUNT(*) AS n FROM chapters WHERE course_id = ?').get(c.id) as unknown as { n: number }).n
    const lessons = (await db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE chapter_id IN (SELECT id FROM chapters WHERE course_id = ?)').get(c.id) as unknown as { n: number }).n
    const enrolled = user ? !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, c.id, user.id) : false
    const done = user
      ? (await db.prepare(`SELECT COUNT(*) AS n FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
          WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ?`).get(c.id, user.id, tenant.id) as unknown as { n: number }).n
      : 0
    return {
      id: c.id, slug: c.slug, title: c.title, description: c.description, level: c.level, priceCents: c.price_cents, imageUrl: (c.image_url as string) || '', chapters, lessons, enrolled,
      progress: { completed: done, total: lessons, pct: lessons ? Math.round((done / lessons) * 100) : 0 },
    }
  }))
  return { courses }
})
