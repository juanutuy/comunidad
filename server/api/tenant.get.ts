// Tenant actual (resuelto por subdominio del host; por defecto el demo)
// + usuario de la sesión si existe.
import { currentAuth, publicUser, resolveTenant } from '../utils/community'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user, role } = currentAuth(event, tenant.id)
  return {
    tenant: {
      id: tenant.id, slug: tenant.slug, name: tenant.name, tagline: tenant.tagline,
      brandColor: tenant.brand_color,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
    },
    user: user ? { ...publicUser(user), role } : null,
  }
})
