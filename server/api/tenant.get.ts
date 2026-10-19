// Tenant actual (resuelto por subdominio del host; por defecto el demo)
// + usuario de la sesión si existe.
// Fase 14: la respuesta suma el estado de la membresía del usuario
// (status: active|pending|declined|suspended|restricted) para que la
// interfaz muestre la pantalla de estado cuando no hay acceso, y las
// compuertas por nivel que lo bloquean (gates) para avisar antes de
// ofrecer el compositor o los mensajes directos.
import { currentAuth, publicUser, resolveTenant } from '../utils/community'
import { myGateStates } from '../utils/members'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role, status } = await currentAuth(event, tenant.id)
  const gates = user && status === 'active'
    ? await myGateStates(event, tenant.id, user.id, role).catch(() => null)
    : null
  return {
    tenant: {
      id: tenant.id, slug: tenant.slug, name: tenant.name, tagline: tenant.tagline,
      brandColor: tenant.brand_color,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
    },
    user: user ? { ...publicUser(user), role } : null,
    status: user ? (status || 'active') : null,
    gates,
  }
})
