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
import { grantPaymentAccess } from '../../utils/payments'
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
      // Fase 17: la concesión vive en grantPaymentAccess, compartida
      // con la aprobación de pagos manuales (mismo acceso, dos vías
      // de confirmación).
      await grantPaymentAccess(db, payment, {
        source: 'stripe',
        stripeSubscriptionId: typeof obj.subscription === 'string' ? obj.subscription : '',
        stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : '',
      })
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
