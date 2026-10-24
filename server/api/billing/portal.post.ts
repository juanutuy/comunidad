import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { stripeConfig } from '../../utils/stripe'
import { eventLocale } from '../../utils/i18n'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ subscriptionId?: number }>(event)
  const db = await dbFor(event)
  const config = useRuntimeConfig()
  const { secretKey } = stripeConfig()
  if (!secretKey || !config.billingPortalConfiguration) throw createError({ statusCode: 409, message: 'El portal de facturación no está configurado. / Billing portal is not configured.' })
  const subscription = await db.prepare("SELECT stripe_customer_id FROM member_subscriptions WHERE tenant_id = ? AND user_id = ? AND id = ? AND source = 'stripe'").get(tenant.id, user.id, Number(body.subscriptionId))
  if (!subscription?.stripe_customer_id) throw createError({ statusCode: 404, message: 'Suscripción no encontrada. / Subscription not found.' })
  // Stripe's portal is customer-wide: refuse shared customer mappings across users or tenants.
  const shared = await db.prepare('SELECT id FROM member_subscriptions WHERE stripe_customer_id = ? AND (tenant_id <> ? OR user_id <> ?) LIMIT 1').get(subscription.stripe_customer_id, tenant.id, user.id)
  if (shared) throw createError({ statusCode: 409, message: 'Esta cuenta de cobro requiere asistencia del administrador. / This billing account requires administrator assistance.' })
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST', headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ customer: subscription.stripe_customer_id, return_url: `${getRequestURL(event).origin}/billing`, configuration: String(config.billingPortalConfiguration), locale: await eventLocale(event, tenant.id) }), signal: AbortSignal.timeout(15000),
  })
  const result = await response.json() as { url?: string }
  if (!response.ok || !result.url || new URL(result.url).origin !== 'https://billing.stripe.com') throw createError({ statusCode: 502, message: 'No se pudo abrir Stripe. / Unable to open Stripe.' })
  setHeader(event, 'cache-control', 'no-store')
  return { url: result.url }
})
