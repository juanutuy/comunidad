// Borrar un método de pago manual (Fase 17, solo admin). Los pagos
// ya registrados conservan su method_id: en la cola de pendientes el
// título sale vacío («—») si el método ya no existe.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const r = await db.prepare('DELETE FROM manual_payment_methods WHERE id = ? AND tenant_id = ?').run(id, tenant.id)
  if (!r.changes) throw createError({ statusCode: 404, message: 'Método no encontrado.' })
  return { ok: true }
})
