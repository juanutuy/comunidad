// Datos públicos de la página de precios del tenant (Fase 4): planes
// activos, canales pagos y cursos pagos, con el estado de los pagos.
// Fase 17: los planes salen en el orden de exhibición elegido por el
// admin (display_order) con su marca de destacado, y la respuesta
// suma la moneda del tenant y si hay pagos manuales utilizables.
import { resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { getPaymentSettings } from '../../utils/payments'
import { stripeEnabled } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  const settings = await getPaymentSettings(event, tenant.id)
  const plans = (await db.prepare('SELECT id, name, description, price_cents, interval, featured FROM plans WHERE tenant_id = ? AND active = 1 ORDER BY display_order, sort, price_cents').all(tenant.id) as Record<string, unknown>[])
    .map(p => ({ id: p.id, name: p.name, description: p.description, priceCents: p.price_cents, interval: p.interval, featured: !!p.featured }))
  const channels = (await db.prepare("SELECT slug, name, description, price_cents FROM channels WHERE tenant_id = ? AND type = 'paid' ORDER BY sort").all(tenant.id) as Record<string, unknown>[])
    .map(c => ({ slug: c.slug, name: c.name, description: c.description, priceCents: c.price_cents }))
  const courses = (await db.prepare('SELECT slug, title, description, level, price_cents FROM courses WHERE tenant_id = ? AND price_cents > 0 ORDER BY created_at').all(tenant.id) as Record<string, unknown>[])
    .map(c => ({ slug: c.slug, title: c.title, description: c.description, level: c.level, priceCents: c.price_cents }))
  let manualEnabled = false
  if (settings.manualPaymentsEnabled) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM manual_payment_methods WHERE tenant_id = ? AND active = 1').get(tenant.id) as { n: number }
    manualEnabled = Number(row?.n || 0) > 0
  }
  return { plans, channels, courses, billingEnabled: stripeEnabled(), manualEnabled, currency: settings.currency, tenant: { name: tenant.name, slug: tenant.slug } }
})
