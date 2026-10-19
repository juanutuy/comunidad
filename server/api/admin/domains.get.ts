// Dominios personalizados del tenant (solo admin, Fase 4).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const domains = (await db.prepare('SELECT id, domain, created_at FROM tenant_domains WHERE tenant_id = ? ORDER BY domain').all(tenant.id) as Record<string, unknown>[])
    .map(d => ({ id: d.id, domain: d.domain, createdAt: d.created_at }))
  return { domains, tenantSlug: tenant.slug }
})
