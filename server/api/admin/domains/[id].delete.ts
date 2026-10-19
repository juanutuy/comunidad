// Quitar un dominio personalizado del tenant (solo admin, Fase 4).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const r = await db.prepare('DELETE FROM tenant_domains WHERE id = ? AND tenant_id = ?').run(id, tenant.id)
  if (!r.changes) throw createError({ statusCode: 404, message: 'Dominio no encontrado.' })
  return { ok: true }
})
