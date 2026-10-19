// Gestión de cursos (solo admin, Fase 5): catálogo completo con
// capítulos y lecciones anidados, en cualquier estado (los borradores
// no salen en el catálogo público, pero aquí se editan).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const courseRows = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? ORDER BY created_at').all(tenant.id) as Record<string, unknown>[]
  const courses = []
  for (const c of courseRows) {
    const chapterRows = await db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort, id').all(c.id) as Record<string, unknown>[]
    const chapters = []
    for (const ch of chapterRows) {
      const lessonRows = await db.prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY sort, id').all(ch.id) as Record<string, unknown>[]
      chapters.push({
        id: ch.id, title: ch.title, sort: ch.sort,
        lessons: lessonRows.map(l => ({
          id: l.id, title: l.title, kind: (l.kind as string) || 'text', status: (l.status as string) || 'published',
          content: l.content || '', videoUrl: l.video_url || '',
          durationMin: l.duration_min, isFree: !!l.is_free, sort: l.sort,
        })),
      })
    }
    const enrolled = (await db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE tenant_id = ? AND course_id = ?').get(tenant.id, c.id) as { n: number }).n
    courses.push({
      id: c.id, slug: c.slug, title: c.title, description: c.description, level: c.level,
      priceCents: c.price_cents, status: c.status || 'published', imageUrl: c.image_url || '',
      visibility: (c.visibility as string) || 'public', dripMode: (c.drip_mode as string) || 'none',
      certificateEnabled: c.certificate_enabled === undefined ? true : !!c.certificate_enabled,
      enrolled, chapters,
    })
  }
  return { courses }
})
