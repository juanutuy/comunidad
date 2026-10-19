// Detalle completo de un curso para la página-estudio (solo admin,
// Fase 8): datos, ajustes y currículum con TODOS los campos de cada
// lección, incluidos los borradores (el catálogo público filtra).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const c = await db.prepare('SELECT * FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id) as Record<string, unknown> | undefined
  if (!c) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const chapterRows = await db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort, id').all(courseId) as Record<string, unknown>[]
  const chapters = []
  for (const ch of chapterRows) {
    const lessonRows = await db.prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY sort, id').all(ch.id) as Record<string, unknown>[]
    chapters.push({
      id: ch.id, title: ch.title, sort: ch.sort,
      lessons: lessonRows.map(l => ({
        id: l.id, title: l.title, kind: (l.kind as string) || 'text', status: (l.status as string) || 'published',
        content: l.content || '', contentHtml: l.content_html || '', videoUrl: l.video_url || '',
        fileUrl: l.file_url || '', fileName: l.file_name || '', embedUrl: l.embed_url || '',
        durationMin: l.duration_min, isFree: !!l.is_free, allowDownload: !!l.allow_download,
        prerequisite: !!l.prerequisite, resourceUrl: l.resource_url || '', resourceName: l.resource_name || '',
        unlockOffsetDays: l.unlock_offset_days === null || l.unlock_offset_days === undefined ? null : Number(l.unlock_offset_days),
        unlockAt: l.unlock_at || '', sort: l.sort,
      })),
    })
  }
  const enrolled = (await db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE tenant_id = ? AND course_id = ?').get(tenant.id, courseId) as { n: number }).n
  return {
    course: {
      id: c.id, slug: c.slug, title: c.title, description: c.description || '',
      shortDescription: c.short_description || '', descriptionHtml: c.description_html || '',
      level: c.level, priceCents: c.price_cents, status: c.status || 'published',
      imageUrl: c.image_url || '', bannerUrl: c.banner_url || '',
      visibility: c.visibility || 'public', enrollLimit: Number(c.enroll_limit || 0),
      dripMode: c.drip_mode || 'none', certificateEnabled: c.certificate_enabled === undefined ? true : !!c.certificate_enabled,
      enrolled, createdAt: c.created_at,
    },
    chapters,
  }
})
