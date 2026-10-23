// Comunidades (tenants) a las que pertenece el usuario de la sesión
// (Fase 10): alimenta la fila de comunidad del panel móvil. Los usuarios
// son globales y las membresías los unen a cada tenant; en la práctica
// casi todos pertenecen a una sola comunidad. Se incluye el primer
// dominio propio registrado del tenant (si tiene) para poder enlazar
// a esa comunidad cuando hay más de una.
import { currentAuth, resolveTenant } from '../utils/community'
import { eventLocale } from '../utils/i18n'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user } = await currentAuth(event, tenant.id)
  if (!user) return { currentTenantId: tenant.id, communities: [] as Record<string, unknown>[] }
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT t.id, t.slug, t.name, t.name_en, t.brand_color AS brandColor, m.role,
      (SELECT d.domain FROM tenant_domains d WHERE d.tenant_id = t.id ORDER BY d.id ASC LIMIT 1) AS domain
    FROM memberships m JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ? ORDER BY t.name ASC`).all(user.id) as Record<string, unknown>[]
  const locale = await eventLocale(event, tenant.id)
  return { currentTenantId: tenant.id, communities: rows.map(row => ({ ...row, name: locale === 'en' ? row.name_en || row.name : row.name })) }
})
