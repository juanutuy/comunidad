// Acceso DEMO a un canal pago: concede el acceso y lo registra en la base
// con source='demo'. El pago real con Stripe es fase 2 (ver README):
// aquí NO se simula ningún checkout.
import { channelBySlug, requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, rawDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const channel = channelBySlug(tenant.id, getRouterParam(event, 'slug')!)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  rawDb().prepare('INSERT OR IGNORE INTO channel_access (tenant_id, user_id, channel_id, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, user.id, channel.id, 'demo', nowIso())
  return { hasAccess: true, source: 'demo' }
})
