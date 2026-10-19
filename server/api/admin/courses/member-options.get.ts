// Opciones de miembros para la inscripción manual a cursos (Fase 14):
// el selector del estudio de cursos necesita id, nombre y correo de
// los miembros activos. Antes salía de /api/admin/members, pero esa
// lista completa es de administración/moderación; el encargado de
// cursos usa esta versión mínima con su propia capacidad.
import { requireCourseManager, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const db = await dbFor(event)
  const members = await db.prepare(`SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.tenant_id = ? AND (m.status = 'active' OR m.status = 'restricted') ORDER BY u.name`).all(tenant.id)
  return { members }
})
