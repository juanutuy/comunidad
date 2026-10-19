// Crea una sesión de Stripe Checkout para un canal pago, un curso pago
// o un plan de membresía (Fase 4). Sin claves de Stripe responde 409:
// la app nunca finge un cobro. El acceso NO se concede aquí: solo lo
// concede el webhook firmado al confirmarse el pago.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { createCheckoutSession, stripeEnabled } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  if (!stripeEnabled())
    throw createError({ statusCode: 409, message: 'Los pagos en línea todavía no están activados en esta comunidad.' })
  const body = await readBody<{ kind?: string, slug?: string, planId?: number }>(event)
  const kind = body.kind || ''
  const db = await dbFor(event)
  const origin = getRequestURL(event).origin

  let amountCents = 0
  let itemId = 0
  let planId = 0
  let productName = ''
  let mode: 'payment' | 'subscription' = 'payment'
  let interval: 'month' | 'year' | undefined

  if (kind === 'channel') {
    const ch = await db.prepare("SELECT * FROM channels WHERE tenant_id = ? AND slug = ? AND type = 'paid'").get(tenant.id, body.slug || '') as Record<string, unknown> | undefined
    if (!ch) throw createError({ statusCode: 404, message: 'Canal pago no encontrado.' })
    if (!(Number(ch.price_cents) > 0)) throw createError({ statusCode: 400, message: 'Este canal no tiene precio.' })
    amountCents = Number(ch.price_cents); itemId = Number(ch.id); productName = `Acceso al canal ${ch.name} · ${tenant.name}`
  }
  else if (kind === 'course') {
    const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, body.slug || '') as Record<string, unknown> | undefined
    if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
    if (!(Number(course.price_cents) > 0)) throw createError({ statusCode: 400, message: 'Este curso es gratuito: inscribite directamente.' })
    amountCents = Number(course.price_cents); itemId = Number(course.id); productName = `Curso ${course.title} · ${tenant.name}`
  }
  else if (kind === 'plan') {
    const plan = await db.prepare('SELECT * FROM plans WHERE tenant_id = ? AND id = ? AND active = 1').get(tenant.id, Number(body.planId) || 0) as Record<string, unknown> | undefined
    if (!plan) throw createError({ statusCode: 404, message: 'Plan no encontrado.' })
    amountCents = Number(plan.price_cents); planId = Number(plan.id); itemId = Number(plan.id); productName = `Membresía ${plan.name} · ${tenant.name}`
    if (plan.interval === 'once') mode = 'payment'
    else { mode = 'subscription'; interval = plan.interval === 'year' ? 'year' : 'month' }
  }
  else throw createError({ statusCode: 400, message: 'Tipo de compra no válido.' })

  const metadata = {
    tenant_id: String(tenant.id), user_id: String(user.id), kind, item_id: String(itemId), plan_id: String(planId),
  }
  const session = await createCheckoutSession({
    mode, amountCents, productName, interval,
    successUrl: `${origin}/billing/return?kind=${kind}&estado=ok`,
    cancelUrl: `${origin}/billing/return?kind=${kind}&estado=cancelado`,
    customerEmail: user.email,
    metadata,
  })
  const now = nowIso()
  const inserted = await db.prepare(`INSERT INTO payments (tenant_id, user_id, kind, item_id, plan_id, amount_cents, currency, status, stripe_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'usd', 'pending', ?, ?, ?)`)
    .run(tenant.id, user.id, kind, itemId, planId, amountCents, session.id, now, now)
  return { url: session.url, paymentId: Number(inserted.lastInsertRowId) }
})
