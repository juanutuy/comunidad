// Configuración de gamificación del tenant (solo admin, Fase 9):
// niveles (nombre, umbral, icono) y puntos por acción. Si el tenant
// aún no tiene filas, se siembran los valores por defecto al leer.
// Fase 14: suma las compuertas por nivel (acción → id de nivel;
// ausente = sin compuerta) de tenants.level_gates.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { POINT_ACTION_META, getGamification } from '../../utils/gamification'
import { GATE_META, getGates } from '../../utils/members'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const gam = await getGamification(event, tenant.id)
  const gates = await getGates(event, tenant.id)
  return {
    levels: gam.levels,
    points: POINT_ACTION_META.map(m => ({ action: m.action, label: m.label, description: m.description, points: gam.points[m.action] })),
    gates: GATE_META.map(m => ({ action: m.action, label: m.label, description: m.description, levelMin: gates[m.action] || 0 })),
  }
})
