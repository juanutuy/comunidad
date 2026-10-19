// Inscripción a un curso (guarda el enrollment en la base).
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, rawDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const db = rawDb()
  const course = db.prepare('SELECT id FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, getRouterParam(event, 'slug')!) as { id: number } | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  db.prepare('INSERT OR IGNORE INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, course.id, user.id, nowIso())
  return { enrolled: true }
})
