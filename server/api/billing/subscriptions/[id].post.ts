import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor, nowIso } from '../../../utils/db'
import { stripeConfig } from '../../../utils/stripe'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ cancelAtPeriodEnd?: unknown }>(event)
  if (typeof body.cancelAtPeriodEnd !== 'boolean') throw createError({ statusCode: 400, message: 'Acción inválida. / Invalid action.' })
  const db = await dbFor(event)
  const row = await db.prepare("SELECT s.*, p.interval AS plan_interval FROM member_subscriptions s JOIN plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id WHERE s.tenant_id = ? AND s.user_id = ? AND s.id = ? AND s.source = 'stripe'").get(tenant.id, user.id, Number(getRouterParam(event, 'id')))
  if (!row?.stripe_subscription_id || row.plan_interval === 'once' || row.status !== 'active') throw createError({ statusCode: 409, message: 'Esta suscripción no admite cambios de renovación. / Renewal cannot be changed for this subscription.' })
  const { secretKey } = stripeConfig()
  if (!secretKey) throw createError({ statusCode: 409, message: 'Stripe no está configurado. / Stripe is not configured.' })
  const url = `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`
  const headers = { authorization: `Bearer ${secretKey}` }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  const current = await response.json() as { id?: string, status?: string, metadata?: Record<string, string>, customer?: string }
  if (!response.ok || current.id !== row.stripe_subscription_id || current.metadata?.tenant_id !== String(tenant.id) || current.metadata?.user_id !== String(user.id) || current.customer !== row.stripe_customer_id) throw createError({ statusCode: 409, message: 'La suscripción necesita conciliación. / Subscription reconciliation required.' })
  const updatedResponse = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ cancel_at_period_end: String(body.cancelAtPeriodEnd) }), signal: AbortSignal.timeout(15000) })
  const updated = await updatedResponse.json() as { id?: string, cancel_at_period_end?: boolean }
  if (!updatedResponse.ok || updated.id !== current.id || updated.cancel_at_period_end !== body.cancelAtPeriodEnd) throw createError({ statusCode: 502, message: 'Stripe no confirmó el cambio. / Stripe did not confirm the change.' })
  // Entitlement still follows signed subscription status/period events, never this button.
  await db.prepare('UPDATE member_subscriptions SET cancel_at_period_end = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ? AND id = ?').run(body.cancelAtPeriodEnd ? 1 : 0, nowIso(), tenant.id, user.id, row.id)
  return { cancelAtPeriodEnd: body.cancelAtPeriodEnd }
})
