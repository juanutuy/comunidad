// Visor de lección (Fase 8): devuelve el contenido según el TIPO de
// lección si el visitante puede verla — lección gratuita (muestra),
// inscrito o admin — y si no está bloqueada por drip ni por
// prerrequisito. Sin acceso devuelve los datos básicos y el motivo
// del candado, nunca el contenido.
import { currentAuth, resolveTenant } from '../../../../utils/community'
import { completedLessonIds, courseAccessible, courseCurriculum, enrollmentOf, flattenLessons, lessonAvailability, serializeLessonForViewer } from '../../../../utils/courses'
import type { CourseRow, LessonRow } from '../../../../utils/courses'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const lessonId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as unknown as CourseRow | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  const isAdmin = role === 'admin'
  const enrollment = await enrollmentOf(event, tenant.id, Number(course.id), user?.id ?? null)
  const enrolled = !!enrollment
  if (!courseAccessible(course, { loggedIn: !!user, isAdmin, enrolled }))
    throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  // En el visor público solo existen las lecciones publicadas; el
  // admin las borrador las abre desde el estudio (vista previa).
  const includeDrafts = isAdmin && getQuery(event).preview === '1'
  const curriculum = await courseCurriculum(event, Number(course.id), includeDrafts)
  const flat = flattenLessons(curriculum)
  const idx = flat.findIndex(l => Number(l.id) === lessonId)
  const lesson = flat[idx] as LessonRow | undefined
  if (!lesson) throw createError({ statusCode: 404, message: 'Lección no encontrada.' })
  const completedIds = await completedLessonIds(event, tenant.id, Number(course.id), user?.id ?? null)
  const availability = lessonAvailability(course, lesson, {
    isAdmin, enrolledAt: enrollment?.created_at ?? null,
    completedIds, prevLessonId: idx > 0 ? Number(flat[idx - 1]!.id) : null,
  })
  const canView = (!!lesson.is_free || enrolled || isAdmin) && !availability.locked
  return {
    course: { slug: course.slug, title: course.title, enrolled },
    lesson: serializeLessonForViewer(lesson, {
      canView,
      completed: completedIds.has(lessonId),
      availability,
    }),
    prevId: idx > 0 ? Number(flat[idx - 1]!.id) : null,
    nextId: idx >= 0 && idx < flat.length - 1 ? Number(flat[idx + 1]!.id) : null,
  }
})
