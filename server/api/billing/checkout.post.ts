// Crea una sesión de Stripe Checkout para un canal pago, un curso pago
// o un plan de membresía (Fase 4). Sin claves de Stripe responde 409:
// la app nunca finge un cobro. El acceso NO se concede aquí: solo lo
// concede el webhook firmado al confirmarse el pago.
// Fase 17: la moneda de la sesión y de la fila `payments` es la del
// tenant (antes fija en USD); qué se compra y cuánto cuesta lo
// resuelve resolvePurchasable, compartido con los pagos manuales.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { eventLocale, msg } from '../../utils/i18n'
import { getPaymentSettings, resolvePurchasable } from '../../utils/payments'
import { createCheckoutSession, stripeEnabled } from '../../utils/stripe'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  if (!stripeEnabled())
    throw createError({ statusCode: 409, message: await msg(event, tenant.id, 'billing.onlineDisabled') })
  const body = await readBody<{ kind?: string, slug?: string, planId?: number }>(event)
  const db = await dbFor(event)
  const origin = getRequestURL(event).origin

  const item = await resolvePurchasable(db, tenant, body, await eventLocale(event, tenant.id))
  const { currency } = await getPaymentSettings(event, tenant.id)
  const mode: 'payment' | 'subscription' = item.kind === 'plan' && item.interval !== 'once' ? 'subscription' : 'payment'
  const interval: 'month' | 'year' | undefined = mode === 'subscription' ? (item.interval === 'year' ? 'year' : 'month') : undefined

  const metadata = {
    tenant_id: String(tenant.id), user_id: String(user.id), kind: item.kind, item_id: String(item.itemId), plan_id: String(item.planId),
  }
  const session = await createCheckoutSession({
    mode, amountCents: item.amountCents, currency: currency.toLowerCase(), productName: item.productName, interval,
    successUrl: `${origin}/billing/return?kind=${item.kind}&estado=ok`,
    cancelUrl: `${origin}/billing/return?kind=${item.kind}&estado=cancelado`,
    customerEmail: user.email,
    metadata,
  })
  const now = nowIso()
  const inserted = await db.prepare(`INSERT INTO payments (tenant_id, user_id, kind, item_id, plan_id, amount_cents, currency, status, gateway, stripe_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'stripe', ?, ?, ?)`)
    .run(tenant.id, user.id, item.kind, item.itemId, item.planId, item.amountCents, currency.toLowerCase(), session.id, now, now)
  return { url: session.url, paymentId: Number(inserted.lastInsertRowId) }
})
