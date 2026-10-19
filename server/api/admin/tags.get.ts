// Etiquetas privadas del tenant (solo admin, Fase 14) con cuántos
// miembros tiene cada una.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const tags = await db.prepare(`SELECT t.id, t.name, t.created_at,
      (SELECT COUNT(*) FROM member_tag_assignments a WHERE a.tag_id = t.id) AS members
    FROM member_tags t WHERE t.tenant_id = ? ORDER BY t.name`).all(tenant.id)
  return { tags }
})
