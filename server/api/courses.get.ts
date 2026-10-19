// Catálogo de cursos con búsqueda y conteos reales.
import { currentAuth, resolveTenant } from '../utils/community'
import { rawDb } from '../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user } = currentAuth(event, tenant.id)
  const q = String(getQuery(event).q || '').trim()
  const db = rawDb()
  const rows = (q
    ? db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND (title LIKE ? OR description LIKE ?) ORDER BY created_at').all(tenant.id, `%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM courses WHERE tenant_id = ? ORDER BY created_at').all(tenant.id)) as Record<string, unknown>[]
  return {
    courses: rows.map((c) => {
      const chapters = (db.prepare('SELECT COUNT(*) AS n FROM chapters WHERE course_id = ?').get(c.id) as { n: number }).n
      const lessons = (db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE chapter_id IN (SELECT id FROM chapters WHERE course_id = ?)').get(c.id) as { n: number }).n
      const enrolled = user ? !!db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, c.id, user.id) : false
      return { id: c.id, slug: c.slug, title: c.title, description: c.description, level: c.level, priceCents: c.price_cents, chapters, lessons, enrolled }
    }),
  }
})
