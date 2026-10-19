// Detalle de curso con currículum (capítulos y lecciones).
// Fase 8: descripción rica sanitizada, banner, visibilidad (un curso
// secreto/privado no se abre sin acceso aunque se conozca el enlace),
// y cada lección con su tipo y su estado de disponibilidad (drip y
// prerrequisito) para que la lista muestre los candados correctos.
import { currentAuth, resolveTenant } from '../../utils/community'
import { requireSessionUnlessPublic } from '../../utils/privacy'
import { completedLessonIds, courseAccessible, courseCurriculum, enrollmentOf, flattenLessons, lessonAvailability } from '../../utils/courses'
import type { CourseRow } from '../../utils/courses'
import { dbFor } from '../../utils/db'
import { sanitizeHtml } from '../../utils/sanitize'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as unknown as CourseRow | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  // Endurecimiento Fase 15: comunidad privada = el curso no se abre sin sesión.
  await requireSessionUnlessPublic(event, tenant.id, user)
  const isAdmin = role === 'admin'
  const enrollment = await enrollmentOf(event, tenant.id, Number(course.id), user?.id ?? null)
  const enrolled = !!enrollment
  if (!courseAccessible(course, { loggedIn: !!user, isAdmin, enrolled }))
    throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const completedIds = await completedLessonIds(event, tenant.id, Number(course.id), user?.id ?? null)
  const curriculum = await courseCurriculum(event, Number(course.id))
  const flat = flattenLessons(curriculum)
  const prevOf = new Map<number, number | null>()
  flat.forEach((l, i) => prevOf.set(Number(l.id), i > 0 ? Number(flat[i - 1]!.id) : null))
  let totalLessons = 0
  const chapters = curriculum.map(({ chapter, lessons }) => {
    totalLessons += lessons.length
    return {
      id: chapter.id, title: chapter.title,
      lessons: lessons.map((l) => {
        const availability = lessonAvailability(course, l, {
          isAdmin, enrolledAt: enrollment?.created_at ?? null,
          completedIds, prevLessonId: prevOf.get(Number(l.id)) ?? null,
        })
        return {
          id: l.id, title: l.title, kind: (l.kind as string) || 'text', durationMin: l.duration_min, isFree: !!l.is_free,
          completed: completedIds.has(Number(l.id)),
          canView: (!!l.is_free || enrolled || isAdmin) && !availability.locked,
          locked: availability.locked, lockReason: availability.reason, availableAt: availability.availableAt,
        }
      }),
    }
  })
  const completedCount = flat.filter(l => completedIds.has(Number(l.id))).length
  const progressPct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0
  return {
    course: {
      id: course.id, slug: course.slug, title: course.title,
      description: course.description, shortDescription: course.short_description || '',
      descriptionHtml: sanitizeHtml(course.description_html || ''),
      level: course.level, priceCents: course.price_cents,
      imageUrl: course.image_url || '', bannerUrl: course.banner_url || '',
      certificateEnabled: course.certificate_enabled === undefined ? true : !!course.certificate_enabled,
      enrolled,
      progress: { completed: completedCount, total: totalLessons, pct: progressPct },
    },
    chapters,
  }
})
