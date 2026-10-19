// Reordenar el currículum completo (solo admin, Fase 8): el estudio
// manda el orden final de capítulos y de lecciones (una lección puede
// cambiar de capítulo al arrastrarla). Se valida que todo id
// pertenezca a ESTE curso antes de tocar nada.
import { requireCourseManager, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

interface Body {
  chapters?: { id: number, sort: number }[]
  lessons?: { id: number, chapterId: number, sort: number }[]
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const body = await readBody<Body>(event)
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id)
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const chapterIds = new Set((await db.prepare('SELECT id FROM chapters WHERE course_id = ?').all(courseId) as { id: number }[]).map(c => Number(c.id)))
  const lessonIds = new Set((await db.prepare('SELECT l.id FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ? AND l.tenant_id = ?').all(courseId, tenant.id) as { id: number }[]).map(l => Number(l.id)))
  for (const ch of body.chapters || []) {
    if (!chapterIds.has(Number(ch.id))) throw createError({ statusCode: 400, message: 'Hay capítulos que no pertenecen a este curso.' })
  }
  for (const l of body.lessons || []) {
    if (!lessonIds.has(Number(l.id)) || !chapterIds.has(Number(l.chapterId)))
      throw createError({ statusCode: 400, message: 'Hay lecciones o capítulos que no pertenecen a este curso.' })
  }
  for (const ch of body.chapters || [])
    await db.prepare('UPDATE chapters SET sort = ? WHERE id = ?').run(Number(ch.sort), Number(ch.id))
  for (const l of body.lessons || [])
    await db.prepare('UPDATE lessons SET chapter_id = ?, sort = ? WHERE id = ?').run(Number(l.chapterId), Number(l.sort), Number(l.id))
  return { ok: true }
})
