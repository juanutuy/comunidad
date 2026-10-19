// Ajustes de la comunidad (solo admin): datos editables del tenant.
import { requireAdmin, resolveTenant } from '../../utils/community'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  return {
    settings: {
      name: tenant.name, tagline: tenant.tagline, brandColor: tenant.brand_color,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
    },
  }
})
