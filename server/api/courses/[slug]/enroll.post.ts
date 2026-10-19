// Inscripción a un curso (guarda el enrollment en la base).
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, getRouterParam(event, 'slug')!) as { id: number } | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  await db.prepare('INSERT OR IGNORE INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, course.id, user.id, nowIso())
  return { enrolled: true }
})
