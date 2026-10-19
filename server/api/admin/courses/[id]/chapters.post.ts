// Agregar un capítulo a un curso (solo admin, Fase 5).
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, sort?: number }>(event)
  const title = (body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, message: 'El capítulo necesita un título.' })
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id)
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  const sort = Number.isFinite(Number(body.sort)) && body.sort !== undefined
    ? Number(body.sort)
    : ((await db.prepare('SELECT COALESCE(MAX(sort), 0) AS n FROM chapters WHERE course_id = ?').get(courseId) as { n: number }).n + 1)
  const id = Number((await db.prepare('INSERT INTO chapters (tenant_id, course_id, title, sort) VALUES (?, ?, ?, ?)')
    .run(tenant.id, courseId, title, sort)).lastInsertRowId)
  return { id }
})
