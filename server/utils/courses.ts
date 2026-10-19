// Lógica compartida de cursos (Fase 8): visibilidad, disponibilidad
// por drip y prerrequisitos, y serialización de lecciones para el
// visor. La usan el catálogo, el detalle, el visor de lección, el
// marcado de completada y el certificado para no divergir.
import type { H3Event } from 'h3'
import { dbFor } from './db'
import { sanitizeHtml } from './sanitize'

export interface CourseRow {
  id: number, tenant_id: number, slug: string, title: string, description: string,
  short_description?: string, description_html?: string, level: string,
  price_cents: number, status: string, image_url: string, banner_url?: string,
  visibility?: string, enroll_limit?: number, drip_mode?: string,
  certificate_enabled?: number, created_at: string,
}

export interface LessonRow {
  id: number, tenant_id: number, chapter_id: number, title: string,
  kind?: string, content: string, content_html?: string, video_url?: string,
  file_url?: string, file_name?: string, embed_url?: string,
  duration_min: number, is_free: number, sort: number, status?: string,
  allow_download?: number, prerequisite?: number,
  resource_url?: string, resource_name?: string,
  unlock_offset_days?: number | null, unlock_at?: string,
  chapter_title?: string,
}

// ¿El curso aparece en listados/búsqueda para este visitante?
//  - secret: nunca (solo enlace directo con acceso).
//  - private: solo con sesión iniciada (miembros).
//  - public: todos.
// Los borradores siguen su regla anterior (solo admin).
export function courseListed(course: CourseRow, opts: { loggedIn: boolean, isAdmin: boolean }): boolean {
  if (course.status === 'draft') return opts.isAdmin
  if ((course.visibility || 'public') === 'secret') return false
  if ((course.visibility || 'public') === 'private') return opts.loggedIn
  return true
}

// ¿Puede abrir la página del curso por enlace directo?
export function courseAccessible(course: CourseRow, opts: { loggedIn: boolean, isAdmin: boolean, enrolled: boolean }): boolean {
  if (opts.isAdmin) return true
  if (course.status === 'draft') return false
  const vis = course.visibility || 'public'
  if (vis === 'secret') return opts.enrolled
  if (vis === 'private') return opts.loggedIn
  return true
}

export interface Availability { locked: boolean, reason: 'drip' | 'prerequisite' | null, availableAt: string | null }

// Disponibilidad de una lección para un usuario concreto.
//  - Drip por fechas (drip_mode='dates'): la fecha `unlock_at` manda
//    para todos (menos admin), incluso para la vista previa gratuita.
//  - Drip por inscripción ('enrollment'): para un inscrito, la
//    lección se libera `unlock_offset_days` días después de su
//    inscripción. Sin inscripción no hay fecha que computar: la
//    lección gratuita se ve como muestra y el resto ya está cerrado
//    por no estar inscrito.
//  - Prerrequisito: la lección anterior del curso (en el orden del
//    currículum) debe estar completada. Sin sesión no hay avance,
//    así que una lección con prerrequisito queda cerrada para
//    visitantes (salvo que sea la primera: no hay anterior).
export function lessonAvailability(
  course: CourseRow,
  lesson: LessonRow,
  ctx: { isAdmin: boolean, enrolledAt: string | null, completedIds: Set<number>, prevLessonId: number | null },
): Availability {
  if (ctx.isAdmin) return { locked: false, reason: null, availableAt: null }
  const mode = course.drip_mode || 'none'
  if (mode === 'dates' && lesson.unlock_at) {
    if (new Date(lesson.unlock_at).getTime() > Date.now())
      return { locked: true, reason: 'drip', availableAt: lesson.unlock_at }
  }
  if (mode === 'enrollment' && ctx.enrolledAt && lesson.unlock_offset_days !== null && lesson.unlock_offset_days !== undefined) {
    const at = new Date(new Date(ctx.enrolledAt).getTime() + Number(lesson.unlock_offset_days) * 86400000)
    if (at.getTime() > Date.now())
      return { locked: true, reason: 'drip', availableAt: at.toISOString() }
  }
  if (lesson.prerequisite && ctx.prevLessonId !== null && !ctx.completedIds.has(ctx.prevLessonId))
    return { locked: true, reason: 'prerequisite', availableAt: null }
  return { locked: false, reason: null, availableAt: null }
}

// Currículum ordenado del curso (capítulos y lecciones publicadas,
// salvo que se pidan también los borradores — vista admin).
export async function courseCurriculum(event: H3Event, courseId: number, includeDrafts = false): Promise<{ chapter: Record<string, unknown>, lessons: LessonRow[] }[]> {
  const db = await dbFor(event)
  const chapterRows = await db.prepare('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort, id').all(courseId) as Record<string, unknown>[]
  const out: { chapter: Record<string, unknown>, lessons: LessonRow[] }[] = []
  for (const ch of chapterRows) {
    const lessons = (await db.prepare(`SELECT * FROM lessons WHERE chapter_id = ?${includeDrafts ? '' : " AND status = 'published'"} ORDER BY sort, id`).all(ch.id) as unknown as LessonRow[])
      .map(l => ({ ...l, chapter_title: ch.title as string }))
    out.push({ chapter: ch, lessons })
  }
  return out
}

// Lista plana ordenada de ids de lección (para anterior/siguiente y
// para saber cuál es la lección previa de cada una).
export function flattenLessons(curriculum: { lessons: LessonRow[] }[]): LessonRow[] {
  return curriculum.flatMap(c => c.lessons)
}

export async function enrollmentOf(event: H3Event, tenantId: number, courseId: number, userId: number | null): Promise<{ created_at: string } | null> {
  if (!userId) return null
  const db = await dbFor(event)
  const row = await db.prepare('SELECT created_at FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?')
    .get(tenantId, courseId, userId) as { created_at: string } | undefined
  return row ?? null
}

export async function completedLessonIds(event: H3Event, tenantId: number, courseId: number, userId: number | null): Promise<Set<number>> {
  if (!userId) return new Set()
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT lp.lesson_id FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
    WHERE lp.tenant_id = ? AND lp.user_id = ? AND ch.course_id = ?`).all(tenantId, userId, courseId) as { lesson_id: number }[]
  return new Set(rows.map(r => Number(r.lesson_id)))
}

// Serialización de una lección para el VISOR: incluye solo lo que el
// tipo necesita y respeta canView (sin acceso no sale el contenido).
export function serializeLessonForViewer(lesson: LessonRow, opts: { canView: boolean, completed: boolean, availability: Availability }) {
  const base = {
    id: lesson.id, title: lesson.title, chapterTitle: lesson.chapter_title || '',
    kind: (lesson.kind as string) || 'text',
    durationMin: lesson.duration_min, isFree: !!lesson.is_free,
    canView: opts.canView, completed: opts.completed,
    locked: opts.availability.locked, lockReason: opts.availability.reason, availableAt: opts.availability.availableAt,
    content: '', contentHtml: '', videoUrl: '', fileUrl: '', fileName: '', embedUrl: '',
    allowDownload: !!lesson.allow_download, resourceUrl: '', resourceName: '',
  }
  if (!opts.canView) return base
  return {
    ...base,
    content: lesson.content || '',
    contentHtml: sanitizeHtml(lesson.content_html || ''),
    videoUrl: lesson.video_url || '',
    fileUrl: lesson.file_url || '',
    fileName: lesson.file_name || '',
    embedUrl: lesson.embed_url || '',
    resourceUrl: lesson.resource_url || '',
    resourceName: lesson.resource_name || '',
  }
}
