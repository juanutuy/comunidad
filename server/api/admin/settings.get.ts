// Ajustes de la comunidad (solo admin): datos editables del tenant.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const row = await db.prepare('SELECT terms, privacy FROM tenants WHERE id = ?').get(tenant.id).catch(() => undefined) as { terms: string, privacy: string } | undefined
  return {
    settings: {
      name: tenant.name, tagline: tenant.tagline, brandColor: tenant.brand_color,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
      terms: row?.terms || '', privacy: row?.privacy || '',
    },
  }
})
