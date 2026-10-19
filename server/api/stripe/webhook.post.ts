// Webhook de Stripe (Fase 4): ÚNICO camino que concede accesos pagos.
// Verifica la firma con el esquema real de Stripe (HMAC sobre
// `t.payload`, tolerancia de tiempo), es idempotente (stripe_events) y
// al `checkout.session.completed` concede, según la metadata validada
// contra la fila `payments` creada por ESTE servidor:
//   - channel → channel_access con source='stripe'
//   - course  → enrollments
//   - plan    → member_subscriptions activa
// La vuelta del navegador a /billing/return nunca concede nada.
import { dbFor, nowIso } from '../../utils/db'
import { stripeConfig, verifyStripeSignature } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const { webhookSecret } = stripeConfig()
  if (!webhookSecret)
    throw createError({ statusCode: 503, message: 'Webhook de Stripe no configurado en este servidor.' })
  const raw = await readRawBody(event, false)
  const payload = typeof raw === 'string' ? raw : raw ? Buffer.from(raw as Uint8Array).toString('utf8') : ''
  const signature = getHeader(event, 'stripe-signature')
  if (!verifyStripeSignature(payload, signature, webhookSecret))
    throw createError({ statusCode: 400, message: 'Firma de Stripe inválida.' })

  let evt: { id?: string, type?: string, data?: { object?: Record<string, unknown> } }
  try { evt = JSON.parse(payload) }
  catch { throw createError({ statusCode: 400, message: 'Payload de Stripe no es JSON válido.' }) }
  if (!evt.id || !evt.type) throw createError({ statusCode: 400, message: 'Evento de Stripe incompleto.' })

  const db = await dbFor(event)
  // Idempotencia: un evento ya registrado no se procesa dos veces.
  const seen = await db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(evt.id)
  if (seen) return { received: true, duplicate: true }
  await db.prepare('INSERT INTO stripe_events (id, type, processed_at) VALUES (?, ?, ?)').run(evt.id, evt.type, nowIso())

  const obj = (evt.data?.object || {}) as Record<string, unknown>
  const now = nowIso()

  if (evt.type === 'checkout.session.completed') {
    const sessionId = String(obj.id || '')
    const payment = await db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(sessionId) as Record<string, unknown> | undefined
    if (payment && payment.status !== 'paid') {
      const paymentIntent = typeof obj.payment_intent === 'string' ? obj.payment_intent : ''
      await db.prepare("UPDATE payments SET status = 'paid', stripe_payment_intent = ?, updated_at = ? WHERE id = ?")
        .run(paymentIntent, now, payment.id)
      const tenantId = Number(payment.tenant_id)
      const userId = Number(payment.user_id)
      if (payment.kind === 'channel') {
        await db.prepare('INSERT OR IGNORE INTO channel_access (tenant_id, user_id, channel_id, source, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(tenantId, userId, Number(payment.item_id), 'stripe', now)
      }
      else if (payment.kind === 'course') {
        await db.prepare('INSERT OR IGNORE INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
          .run(tenantId, Number(payment.item_id), userId, now)
      }
      else if (payment.kind === 'plan') {
        const planId = Number(payment.plan_id || payment.item_id)
        await db.prepare(`INSERT INTO member_subscriptions (tenant_id, user_id, plan_id, status, source, stripe_subscription_id, stripe_customer_id, created_at, updated_at)
          VALUES (?, ?, ?, 'active', 'stripe', ?, ?, ?, ?)
          ON CONFLICT(tenant_id, user_id, plan_id) DO UPDATE SET status = 'active', stripe_subscription_id = excluded.stripe_subscription_id, stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at`)
          .run(tenantId, userId, planId, typeof obj.subscription === 'string' ? obj.subscription : '', typeof obj.customer === 'string' ? obj.customer : '', now, now)
      }
    }
  }
  else if (evt.type === 'checkout.session.expired' || evt.type === 'checkout.session.async_payment_failed') {
    const sessionId = String(obj.id || '')
    await db.prepare("UPDATE payments SET status = 'failed', updated_at = ? WHERE stripe_session_id = ? AND status = 'pending'")
      .run(now, sessionId)
  }
  else if (evt.type === 'customer.subscription.deleted') {
    const subId = String(obj.id || '')
    if (subId) {
      await db.prepare("UPDATE member_subscriptions SET status = 'canceled', updated_at = ? WHERE stripe_subscription_id = ?")
        .run(now, subId)
    }
  }

  return { received: true }
})
