// Borrar un plan de membresía (solo admin, Fase 4). No se borran las
// suscripciones históricas: si el plan tiene suscripciones, se desactiva.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const subs = (await db.prepare('SELECT COUNT(*) AS n FROM member_subscriptions WHERE plan_id = ?').get(id) as { n: number }).n
  if (subs > 0) {
    await db.prepare('UPDATE plans SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenant.id)
    return { ok: true, deactivated: true }
  }
  const r = await db.prepare('DELETE FROM plans WHERE id = ? AND tenant_id = ?').run(id, tenant.id)
  if (!r.changes) throw createError({ statusCode: 404, message: 'Plan no encontrado.' })
  return { ok: true }
})
