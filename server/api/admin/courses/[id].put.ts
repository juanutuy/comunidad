// Editar un curso (solo admin, Fase 5). El slug no cambia para no
// romper enlaces ni pagos ya registrados con ese curso.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { parseCourseInput } from '../../../utils/courseAdmin'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const input = parseCourseInput(await readBody(event))
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id)
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  await db.prepare('UPDATE courses SET title = ?, description = ?, level = ?, price_cents = ?, status = ?, image_url = ? WHERE id = ?')
    .run(input.title, input.description, input.level, input.priceCents, input.status, input.imageUrl, courseId)
  return { ok: true }
})
