// Stripe (Fase 4) — integración completa pero EN OSCURO: sin los
// secretos del Worker (NUXT_STRIPE_SECRET_KEY / NUXT_STRIPE_WEBHOOK_SECRET)
// la app NO cobra, el endpoint de checkout responde 409 y la UI muestra
// «Pagos en línea próximamente». Nada de SDK: se habla con la API de
// Stripe por fetch con cuerpo form-encoded, como pide su API.
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface StripeConfig { secretKey: string, webhookSecret: string, publishableKey: string }

export function stripeConfig(): StripeConfig {
  const cfg = useRuntimeConfig()
  return {
    secretKey: (cfg.stripeSecretKey as string) || '',
    webhookSecret: (cfg.stripeWebhookSecret as string) || '',
    publishableKey: (cfg.public as { stripePublishableKey?: string }).stripePublishableKey || '',
  }
}

export function stripeEnabled(): boolean {
  const c = stripeConfig()
  return !!c.secretKey && !!c.webhookSecret
}

/** Cancel a recurring subscription immediately before account anonymization. */
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  const { secretKey } = stripeConfig()
  if (!secretKey) throw createError({ statusCode: 409, message: 'Configura Stripe antes de eliminar una cuenta con una suscripción activa.' })
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const data = await res.json() as { id?: string, status?: string, error?: { message?: string } }
  if (!res.ok || data.id !== subscriptionId || data.status !== 'canceled') {
    throw createError({ statusCode: 502, message: `Stripe no confirmó la cancelación de una suscripción: ${data.error?.message || res.status}` })
  }
}

export interface CheckoutInput {
  mode: 'payment' | 'subscription'
  amountCents: number
  currency?: string
  productName: string
  interval?: 'month' | 'year' // solo subscription
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  metadata: Record<string, string>
}

// Crea una sesión de Stripe Checkout y devuelve { id, url }.
export async function createCheckoutSession(input: CheckoutInput): Promise<{ id: string, url: string }> {
  const { secretKey } = stripeConfig()
  if (!secretKey) throw createError({ statusCode: 409, message: 'Los pagos en línea todavía no están activados en esta comunidad.' })
  const form = new URLSearchParams()
  form.set('mode', input.mode)
  form.set('success_url', input.successUrl)
  form.set('cancel_url', input.cancelUrl)
  if (input.customerEmail) form.set('customer_email', input.customerEmail)
  form.set('line_items[0][quantity]', '1')
  form.set('line_items[0][price_data][currency]', input.currency || 'usd')
  form.set('line_items[0][price_data][unit_amount]', String(input.amountCents))
  form.set('line_items[0][price_data][product_data][name]', input.productName)
  if (input.mode === 'subscription') {
    form.set('line_items[0][price_data][recurring][interval]', input.interval === 'year' ? 'year' : 'month')
    // La metadata también va a la suscripción creada, para conciliación.
    for (const [k, v] of Object.entries(input.metadata)) form.set(`subscription_data[metadata][${k}]`, v)
  }
  else {
    for (const [k, v] of Object.entries(input.metadata)) form.set(`payment_intent_data[metadata][${k}]`, v)
  }
  for (const [k, v] of Object.entries(input.metadata)) form.set(`metadata[${k}]`, v)
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const data = await res.json() as { id?: string, url?: string, error?: { message?: string } }
  if (!res.ok || !data.id || !data.url) {
    throw createError({ statusCode: 502, message: `Stripe rechazó la sesión de pago: ${data.error?.message || res.status}` })
  }
  return { id: data.id, url: data.url }
}

// Verificación de firma del webhook, esquema real de Stripe:
// firma = HMAC_SHA256(webhookSecret, `${t}.${payload}`), header
// `stripe-signature: t=<ts>,v1=<hex>[,v1=<hex>...]`. Tolerancia 5 min.
export function verifyStripeSignature(rawPayload: string, signatureHeader: string | undefined, secret: string, toleranceSec = 300): boolean {
  if (!signatureHeader || !secret) return false
  const parts: Record<string, string[]> = {}
  for (const piece of signatureHeader.split(',')) {
    const idx = piece.indexOf('=')
    if (idx < 0) continue
    const k = piece.slice(0, idx).trim()
    const v = piece.slice(idx + 1).trim()
    ;(parts[k] ||= []).push(v)
  }
  const t = parts.t?.[0]
  const signatures = parts.v1 || []
  if (!t || !signatures.length) return false
  const ts = Number(t)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawPayload}`, 'utf8').digest('hex')
  const expectedBuf = Buffer.from(expected)
  return signatures.some((sig) => {
    const buf = Buffer.from(sig)
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf)
  })
}
