// Planes de membresía del tenant (solo admin, Fase 4).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const plans = (await db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM member_subscriptions s WHERE s.plan_id = p.id AND s.status = 'active') AS active_subs
    FROM plans p WHERE p.tenant_id = ? ORDER BY p.sort, p.price_cents`).all(tenant.id) as Record<string, unknown>[])
    .map(p => ({
      id: p.id, name: p.name, description: p.description, priceCents: p.price_cents,
      interval: p.interval, active: !!p.active, activeSubs: p.active_subs,
    }))
  return { plans }
})
