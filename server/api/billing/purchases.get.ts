// Compras y suscripciones del usuario en sesión (Fase 4): la página de
// retorno y «Mis compras» leen el estado REAL desde la base (lo marca
// el webhook), nunca desde lo que diga la URL.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  setHeader(event, 'cache-control', 'private, no-store')
  const payments = await db.prepare(`SELECT p.id, p.kind, p.item_id, p.plan_id, p.amount_cents, p.currency, p.status, p.gateway, p.created_at,
      COALESCE(c.name, co.title, pl.name, '') AS item_name
    FROM payments p
    LEFT JOIN channels c ON p.kind = 'channel' AND c.id = p.item_id AND c.tenant_id = p.tenant_id
    LEFT JOIN courses co ON p.kind = 'course' AND co.id = p.item_id AND co.tenant_id = p.tenant_id
    LEFT JOIN plans pl ON p.kind = 'plan' AND pl.id = p.item_id AND pl.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.user_id = ? ORDER BY p.id DESC LIMIT 30`).all(tenant.id, user.id) as Record<string, unknown>[]
  const subscriptions = await db.prepare(`SELECT s.id, s.status, s.source, s.cancel_at_period_end, s.stripe_subscription_id, s.stripe_customer_id, s.current_period_end, pl.name AS plan_name, pl.interval AS plan_interval
    FROM member_subscriptions s JOIN plans pl ON pl.id = s.plan_id AND pl.tenant_id = s.tenant_id
    WHERE s.tenant_id = ? AND s.user_id = ? ORDER BY s.id DESC`).all(tenant.id, user.id) as Record<string, unknown>[]
  return {
    payments: payments.map(p => ({ id: p.id, kind: p.kind, itemId: p.item_id, planId: p.plan_id, itemName: p.item_name, amountCents: p.amount_cents, currency: p.currency, status: p.status, gateway: p.gateway || 'stripe', createdAt: p.created_at })),
    subscriptions: subscriptions.map(s => ({ id: s.id, planName: s.plan_name, interval: s.plan_interval, status: s.status, source: s.source, cancelAtPeriodEnd: !!s.cancel_at_period_end, canManage: s.source === 'stripe' && !!s.stripe_customer_id && !!useRuntimeConfig().billingPortalConfiguration, canChangeRenewal: s.source === 'stripe' && !!s.stripe_subscription_id && s.status === 'active' && s.plan_interval !== 'once', currentPeriodEnd: s.current_period_end })),
  }
})
