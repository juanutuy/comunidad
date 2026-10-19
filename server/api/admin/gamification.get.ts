// Configuración de gamificación del tenant (solo admin, Fase 9):
// niveles (nombre, umbral, icono) y puntos por acción. Si el tenant
// aún no tiene filas, se siembran los valores por defecto al leer.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { POINT_ACTION_META, getGamification } from '../../utils/gamification'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const gam = await getGamification(event, tenant.id)
  return {
    levels: gam.levels,
    points: POINT_ACTION_META.map(m => ({ action: m.action, label: m.label, description: m.description, points: gam.points[m.action] })),
  }
})
