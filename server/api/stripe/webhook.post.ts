import { dbFor, nowIso } from '../../utils/db'
import type { DbCommand } from '../../utils/db'
import { paymentGrantCommands } from '../../utils/payments'
import { stripeConfig, verifyStripeSignature } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const { webhookSecret } = stripeConfig()
  if (!webhookSecret) throw createError({ statusCode: 503, message: 'Webhook no configurado.' })
  const payload = await readRawBody(event) || ''
  if (!verifyStripeSignature(payload, getHeader(event, 'stripe-signature'), webhookSecret))
    throw createError({ statusCode: 400, message: 'Firma de Stripe inválida.' })
  let evt: { id?: string, type?: string, created?: number, data?: { object?: Record<string, any> } }
  try { evt = JSON.parse(payload) }
  catch { throw createError({ statusCode: 400, message: 'JSON inválido.' }) }
  if (typeof evt.id !== 'string' || !evt.id || typeof evt.type !== 'string' || !evt.type || !Number.isSafeInteger(evt.created)) throw createError({ statusCode: 400, message: 'Evento incompleto.' })
  const db = await dbFor(event)
  if (await db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(evt.id)) return { received: true, duplicate: true }
  const obj = evt.data?.object || {}
  const commands: DbCommand[] = []
  const now = nowIso()
  if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
    const payment = await db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(String(obj.id || ''))
    // Do not acknowledge a race with checkout creation: Stripe will retry.
    if (!payment) throw createError({ statusCode: 503, message: 'Pago pendiente de conciliación.' })
    if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') {
      if (Number(obj.amount_total) !== payment.amount_cents || String(obj.currency).toLowerCase() !== String(payment.currency).toLowerCase())
        throw createError({ statusCode: 400, message: 'Importe o moneda no coincide.' })
      const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : ''
      // Subscription period is obtained from Stripe's authoritative object, not guessed.
      let periodEnd = ''
      let subscriptionStatus: 'active' | 'inactive' | 'canceled' = 'active'
      if (subscriptionId) {
        const { secretKey } = stripeConfig()
        const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          headers: { authorization: `Bearer ${secretKey}`, 'Stripe-Version': '2025-06-30.basil' },
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) throw createError({ statusCode: 503, message: 'No se pudo conciliar la suscripción.' })
        const sub = await response.json() as Record<string, any>
        const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
        if (!Number.isFinite(end)) throw createError({ statusCode: 503, message: 'Suscripción sin período confirmado.' })
        periodEnd = new Date(end * 1000).toISOString()
        subscriptionStatus = sub.status === 'canceled' ? 'canceled' : ['active', 'trialing'].includes(sub.status) ? 'active' : 'inactive'
      }
      commands.push(...paymentGrantCommands(payment, {
        source: 'stripe', periodEnd, subscriptionStatus, stripeEventCreated: evt.created, stripeSubscriptionId: subscriptionId,
        stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : '',
      }), { sql: "UPDATE payments SET status = 'paid', stripe_payment_intent = ?, updated_at = ? WHERE id = ? AND status = 'pending'", params: [typeof obj.payment_intent === 'string' ? obj.payment_intent : '', now, payment.id] })
    }
  }
  else if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(evt.type)) {
    commands.push({ sql: "UPDATE payments SET status = 'failed', updated_at = ? WHERE stripe_session_id = ? AND status = 'pending'", params: [now, String(obj.id || '')] })
  }
  else if (evt.type.startsWith('customer.subscription.')) {
    const id = String(obj.id || '')
    const existing = await db.prepare('SELECT id FROM member_subscriptions WHERE stripe_subscription_id = ?').get(id)
    // A subscription event may precede checkout completion; wait for its local mapping.
    if (!existing && evt.type !== 'customer.subscription.deleted') throw createError({ statusCode: 503, message: 'Suscripción pendiente de conciliación.' })
    const end = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end
    const status = evt.type === 'customer.subscription.deleted' ? 'canceled' : ['active', 'trialing'].includes(obj.status) ? 'active' : 'inactive'
    if (status === 'active' && !Number.isFinite(end)) throw createError({ statusCode: 503, message: 'Suscripción sin período confirmado.' })
    commands.push({ sql: `UPDATE member_subscriptions SET status = ?, current_period_end = ?, stripe_event_created = ?, updated_at = ?
      WHERE stripe_subscription_id = ? AND stripe_event_created <= ? AND (status <> 'canceled' OR ? = 'canceled')`, params: [status, Number.isFinite(end) ? new Date(end * 1000).toISOString() : now, evt.created, now, id, evt.created, status] })
  }
  commands.push({ sql: 'INSERT OR IGNORE INTO stripe_events (id, type, processed_at) VALUES (?, ?, ?)', params: [evt.id, evt.type, now] })
  await db.batch(commands)
  return { received: true }
})
