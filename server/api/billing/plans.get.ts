// Datos públicos de la página de precios del tenant (Fase 4): planes
// activos, canales pagos y cursos pagos, con el estado de los pagos.
import { resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { stripeEnabled } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  const plans = (await db.prepare('SELECT id, name, description, price_cents, interval FROM plans WHERE tenant_id = ? AND active = 1 ORDER BY sort, price_cents').all(tenant.id) as Record<string, unknown>[])
    .map(p => ({ id: p.id, name: p.name, description: p.description, priceCents: p.price_cents, interval: p.interval }))
  const channels = (await db.prepare("SELECT slug, name, description, price_cents FROM channels WHERE tenant_id = ? AND type = 'paid' ORDER BY sort").all(tenant.id) as Record<string, unknown>[])
    .map(c => ({ slug: c.slug, name: c.name, description: c.description, priceCents: c.price_cents }))
  const courses = (await db.prepare('SELECT slug, title, description, level, price_cents FROM courses WHERE tenant_id = ? AND price_cents > 0 ORDER BY created_at').all(tenant.id) as Record<string, unknown>[])
    .map(c => ({ slug: c.slug, title: c.title, description: c.description, level: c.level, priceCents: c.price_cents }))
  return { plans, channels, courses, billingEnabled: stripeEnabled(), tenant: { name: tenant.name, slug: tenant.slug } }
})
